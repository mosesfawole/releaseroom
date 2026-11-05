import { randomUUID } from "node:crypto";

import { WebSocket, type RawData } from "ws";

import type { SwitchEvent } from "./protocol.js";
import {
  connectionStateSchema,
  gapFrameDataSchema,
  messageFrameDataSchema,
  postMessageResponseSchema,
  switchSocketFrameSchema,
  type SwitchSocketFrame,
} from "./protocol.js";

export type SwitchClientOptions = {
  baseUrl: string;
  agentId: string;
  apiKey: string;
  roomId: string;
  connectionId?: string;
  reconnectDelayMs?: number;
  onEvent(event: SwitchEvent): Promise<void> | void;
};

export class SwitchHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Switch request failed with HTTP ${status}`);
    this.name = "SwitchHttpError";
  }
}

export class SwitchProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SwitchProtocolError";
  }
}

export class SwitchClient {
  private readonly baseUrl: URL;
  private readonly connectionId: string;
  private readonly reconnectDelayMs: number;
  private cursor = 0;
  private position: Record<string, number> = {};
  private generation: number | null = null;
  private stopped = false;
  private connected = false;
  private socket: WebSocket | null = null;
  private runPromise: Promise<void> | null = null;
  private connectedPromise: Promise<void> | null = null;
  private resolveConnected: (() => void) | null = null;
  private rejectConnected: ((error: unknown) => void) | null = null;

  constructor(private readonly options: SwitchClientOptions) {
    this.baseUrl = normaliseBaseUrl(options.baseUrl);
    this.connectionId = options.connectionId ?? randomUUID();
    this.reconnectDelayMs = options.reconnectDelayMs ?? 500;
  }

  connect(): Promise<void> {
    if (this.connectedPromise) return this.connectedPromise;
    const attempt = this.startConnection();
    this.connectedPromise = attempt;
    void attempt.catch(() => {
      if (!this.connected && this.connectedPromise === attempt) this.connectedPromise = null;
    });
    return attempt;
  }

  private async startConnection(): Promise<void> {
    const healthResponse = await fetch(this.httpUrl("health"));
    if (!healthResponse.ok) {
      throw new SwitchHttpError(healthResponse.status, await healthResponse.text());
    }

    const firstSocket = new Promise<void>((resolve, reject) => {
      this.resolveConnected = resolve;
      this.rejectConnected = reject;
    });
    this.runPromise = this.connectionLoop();
    return firstSocket;
  }

  async postMessage(roomId: string, content: string): Promise<string> {
    const response = await fetch(
      this.httpUrl(`agents/${encodeURIComponent(this.options.agentId)}/message`),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ room_id: roomId, content }),
      },
    );
    const body = await response.text();
    if (!response.ok) throw new SwitchHttpError(response.status, body);

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new SwitchProtocolError("Switch returned invalid JSON after posting a message");
    }
    const result = postMessageResponseSchema.safeParse(parsed);
    if (!result.success) {
      throw new SwitchProtocolError("Switch returned an invalid message response");
    }
    return result.data.event_id;
  }

  async close(): Promise<void> {
    this.stopped = true;
    const socket = this.socket;
    if (socket?.readyState === WebSocket.OPEN) socket.close(1000, "client shutdown");
    else if (socket?.readyState === WebSocket.CONNECTING) socket.terminate();
    await this.runPromise;
  }

  private async connectionLoop(): Promise<void> {
    while (!this.stopped) {
      try {
        await this.openSocket();
      } catch (error) {
        if (!this.connected) {
          this.rejectConnected?.(error);
          return;
        }
        await this.options.onEvent({ type: "connection_error", error: errorMessage(error) });
      }
      if (!this.stopped) await new Promise((resolve) => setTimeout(resolve, this.reconnectDelayMs));
    }
  }

  private openSocket(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.webSocketUrl(), {
        headers: { Authorization: `Bearer ${this.options.apiKey}` },
      });
      this.socket = socket;
      let confirmed = false;
      let transportError: unknown = null;
      let protocolError: unknown = null;
      let refusal: { status: number; detail: unknown } | null = null;
      let processing = Promise.resolve();

      const settleAfterProcessing = (callback: () => void): void => {
        void processing.then(callback);
      };

      socket.on("message", (raw: RawData) => {
        let candidate: unknown;
        try {
          candidate = JSON.parse(raw.toString());
        } catch {
          protocolError = new SwitchProtocolError("Switch sent a non-JSON WebSocket frame");
          socket.close(1002, "invalid frame");
          return;
        }
        const parsed = switchSocketFrameSchema.safeParse(candidate);
        if (!parsed.success) {
          protocolError = new SwitchProtocolError("Switch sent an invalid WebSocket frame");
          socket.close(1002, "invalid frame");
          return;
        }
        if (parsed.data.event === "ping") {
          socket.send(
            JSON.stringify({ type: "pong", cursor: this.cursor, position: this.position }),
          );
          return;
        }
        if (parsed.data.event === "refused") {
          const status = parsed.data.data.status;
          if (typeof status === "number") refusal = { status, detail: parsed.data.data.detail };
        }
        processing = processing
          .then(async () => {
            await this.handleFrame(parsed.data, () => {
              confirmed = true;
              if (!this.connected) {
                this.connected = true;
                this.resolveConnected?.();
              }
            });
          })
          .catch((error: unknown) => {
            protocolError = error;
            socket.close(1002, "protocol error");
          });
      });
      socket.on("error", (error) => {
        transportError = error;
      });
      socket.on("close", (code, reason) => {
        if (this.socket === socket) this.socket = null;
        settleAfterProcessing(() => {
          if (protocolError) reject(protocolError);
          else if (refusal) {
            reject(new SwitchHttpError(refusal.status, JSON.stringify(refusal.detail)));
          } else if (!confirmed) {
            reject(
              transportError ??
                new Error(
                  `Switch socket closed before connection state (${code}: ${reason.toString()})`,
                ),
            );
          } else if (transportError) reject(transportError);
          else resolve();
        });
      });
    });
  }

  private async handleFrame(
    frame: SwitchSocketFrame,
    onConnected: () => void,
  ): Promise<void> {
    if (frame.event === "connection_state") {
      const state = connectionStateSchema.safeParse(frame.data);
      if (!state.success) throw new SwitchProtocolError("Switch sent an invalid connection state");
      this.cursor = state.data.cursor;
      this.position = state.data.position ?? {};
      this.generation = state.data.generation ?? null;
      onConnected();
      return;
    }

    if (frame.event === "message") {
      const message = messageFrameDataSchema.safeParse(frame.data);
      if (!message.success) throw new SwitchProtocolError("Switch sent an invalid message frame");
      if (message.data.payload.addressed && message.data.room_id === this.options.roomId) {
        await this.options.onEvent({
          type: "message",
          roomId: message.data.room_id,
          messageId: message.data.payload.message_id,
          senderId: message.data.payload.sender,
          senderName: message.data.payload.sender_name,
          senderKind: message.data.payload.sender_kind ?? null,
          content: message.data.payload.body,
          threadId: message.data.payload.thread_id ?? null,
        });
      }
      this.advance(frame, message.data.sequence, message.data.position);
      return;
    }

    if (frame.event === "gap") {
      const gap = gapFrameDataSchema.safeParse(frame.data);
      if (!gap.success) throw new SwitchProtocolError("Switch sent an invalid gap frame");
      await this.options.onEvent({
        type: "gap",
        fromSequence: gap.data.from_sequence,
        ...(gap.data.resumed_at === undefined ? {} : { resumedAt: gap.data.resumed_at }),
        ...(gap.data.resumed_position === undefined
          ? {}
          : { resumedPosition: gap.data.resumed_position }),
        reason: gap.data.reason,
        ...(gap.data.rooms === undefined ? {} : { rooms: gap.data.rooms }),
      });
      if (gap.data.resumed_at !== undefined) this.cursor = gap.data.resumed_at;
      if (gap.data.resumed_position !== undefined) this.position = gap.data.resumed_position;
      return;
    }
  }

  private advance(
    frame: SwitchSocketFrame,
    sequence: number | undefined,
    position: Record<string, number> | undefined,
  ): void {
    const frameId = typeof frame.id === "number" ? frame.id : Number(frame.id);
    const nextCursor = Number.isSafeInteger(frameId) && frameId >= 0 ? frameId : sequence;
    if (nextCursor !== undefined && nextCursor > this.cursor) this.cursor = nextCursor;
    if (position) this.position = { ...this.position, ...position };
  }

  private httpUrl(path: string): URL {
    return new URL(path, this.baseUrl);
  }

  private webSocketUrl(): URL {
    const url = this.httpUrl(`agents/${encodeURIComponent(this.options.agentId)}/connection/ws`);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("connection_id", this.connectionId);
    url.searchParams.set("scope", "single");
    url.searchParams.set("filter", "addressed");
    url.searchParams.set("start_from", this.cursor > 0 ? String(this.cursor) : "head");
    url.searchParams.set(
      "start_at",
      Object.keys(this.position).length ? JSON.stringify(this.position) : "head",
    );
    url.searchParams.set("rooms", this.options.roomId);
    url.searchParams.set("protocol", "9");
    url.searchParams.set("protocol_accepts", "1");
    url.searchParams.set("client", "releaseroom");
    url.searchParams.set("client_version", "0.1.0");
    if (this.generation !== null) {
      url.searchParams.set("expected_generation", String(this.generation));
    }
    return url;
  }
}

function normaliseBaseUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("Switch base URL must use HTTP or HTTPS");
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  url.search = "";
  url.hash = "";
  return url;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
