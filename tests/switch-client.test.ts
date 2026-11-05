import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";

import { SwitchClient, SwitchHttpError } from "../src/switch/client.js";
import type { SwitchEvent } from "../src/switch/protocol.js";

type RecordedRequest = {
  method: string;
  url: string;
  authorization?: string;
  body: unknown;
};

type FakeSwitch = {
  baseUrl: string;
  requests: RecordedRequest[];
  upgrades: { url: string; authorization?: string }[];
  sockets: WebSocket[];
  clientFrames: unknown[];
  close(): Promise<void>;
};

const runningServers: FakeSwitch[] = [];

afterEach(async () => {
  await Promise.all(runningServers.splice(0).map((server) => server.close()));
});

describe("SwitchClient", () => {
  it("shares one in-flight probe and socket handshake across concurrent connect calls", async () => {
    const fake = await startFakeSwitch(undefined, { healthDelayMs: 50 });
    const client = createClient(fake.baseUrl);
    let firstFinished = false;
    let secondFinished = false;

    const first = client.connect().then(() => {
      firstFinished = true;
    });
    const second = client.connect().then(() => {
      secondFinished = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const finishedBeforeHandshake = { firstFinished, secondFinished };
    await Promise.all([first, second]);

    expect(finishedBeforeHandshake).toEqual({ firstFinished: false, secondFinished: false });
    expect(fake.requests.filter((request) => request.url === "/health")).toHaveLength(1);

    await client.close();
  });

  it("probes public health, opens the authenticated room socket, and posts with bearer auth", async () => {
    const fake = await startFakeSwitch();
    const client = createClient(fake.baseUrl);

    await client.connect();
    const eventId = await client.postMessage("room-1", "verification ready");

    expect(fake.requests[0]).toMatchObject({ method: "GET", url: "/health" });
    expect(fake.requests[0]?.authorization).toBeUndefined();
    expect(fake.upgrades[0]?.authorization).toBe("Bearer test-key");
    const socketUrl = new URL(fake.upgrades[0]!.url, fake.baseUrl);
    expect(socketUrl.pathname).toBe("/agents/gatekeeper-1/connection/ws");
    expect(Object.fromEntries(socketUrl.searchParams)).toMatchObject({
      connection_id: "connection-1",
      scope: "single",
      filter: "addressed",
      start_from: "head",
      start_at: "head",
      rooms: "room-1",
      protocol: "9",
      protocol_accepts: "1",
    });
    expect(eventId).toBe("event-1");
    expect(fake.requests[1]).toEqual({
      method: "POST",
      url: "/agents/gatekeeper-1/message",
      authorization: "Bearer test-key",
      body: { room_id: "room-1", content: "verification ready" },
    });

    await client.close();
  });

  it("answers pings with the handled cursor and delivers only addressed room messages", async () => {
    const events: SwitchEvent[] = [];
    const fake = await startFakeSwitch();
    const client = createClient(fake.baseUrl, async (event) => {
      events.push(event);
    });
    await client.connect();

    fake.sockets[0]!.send(JSON.stringify(messageFrame(1, false, "ignore me")));
    fake.sockets[0]!.send(JSON.stringify(messageFrame(2, true, "approve this")));
    await waitFor(() => events.length === 1);
    fake.sockets[0]!.send(JSON.stringify({ event: "ping", data: {} }));
    await waitFor(() => fake.clientFrames.length === 1);

    expect(events).toEqual([
      {
        type: "message",
        roomId: "room-1",
        messageId: "message-2",
        senderId: "@switch-user-human:local",
        senderName: "Moses",
        senderKind: "user",
        content: "approve this",
        threadId: null,
      },
    ]);
    expect(fake.clientFrames).toEqual([{ type: "pong", cursor: 2, position: { s: 2 } }]);

    await client.close();
  });

  it("reuses its connection and cursor, then propagates a cursor-expiry gap", async () => {
    const events: SwitchEvent[] = [];
    const fake = await startFakeSwitch((socket, _request, connectionNumber) => {
      socket.send(JSON.stringify(connectionState(connectionNumber === 0 ? 0 : 3)));
      if (connectionNumber === 0) return;
      socket.send(
        JSON.stringify({
          event: "gap",
          data: {
            from_sequence: 4,
            resumed_at: 10,
            resumed_position: { s: 10 },
            reason: "cursor expired before retained events",
            rooms: ["room-1"],
          },
        }),
      );
    });
    const client = createClient(fake.baseUrl, async (event) => {
      events.push(event);
    });
    await client.connect();

    fake.sockets[0]!.send(JSON.stringify(messageFrame(3, true, "verify CASE-001")));
    await waitFor(() => events.length === 1);
    fake.sockets[0]!.close(1012, "restart");
    await waitFor(() => fake.upgrades.length === 2);
    await waitFor(() => events.length === 2);

    const reconnectUrl = new URL(fake.upgrades[1]!.url, fake.baseUrl);
    expect(reconnectUrl.searchParams.get("connection_id")).toBe("connection-1");
    expect(reconnectUrl.searchParams.get("start_from")).toBe("3");
    expect(reconnectUrl.searchParams.get("start_at")).toBe(JSON.stringify({ s: 3 }));
    expect(events[1]).toEqual({
      type: "gap",
      fromSequence: 4,
      resumedAt: 10,
      resumedPosition: { s: 10 },
      reason: "cursor expired before retained events",
      rooms: ["room-1"],
    });

    await client.close();
  });

  it("surfaces unhealthy probes, network failures, and non-2xx message responses", async () => {
    const unhealthy = await startFakeSwitch(undefined, { healthStatus: 503 });
    await expect(createClient(unhealthy.baseUrl).connect()).rejects.toMatchObject({
      name: "SwitchHttpError",
      status: 503,
    });

    const refusing = await startFakeSwitch(undefined, { postStatus: 422 });
    const client = createClient(refusing.baseUrl);
    await client.connect();
    await expect(client.postMessage("room-1", "blocked")).rejects.toBeInstanceOf(SwitchHttpError);
    await client.close();

    await expect(
      createClient("http://127.0.0.1:1").connect(),
    ).rejects.toThrow();
  });
});

function createClient(
  baseUrl: string,
  onEvent: (event: SwitchEvent) => Promise<void> | void = () => {},
): SwitchClient {
  return new SwitchClient({
    baseUrl,
    agentId: "gatekeeper-1",
    apiKey: "test-key",
    roomId: "room-1",
    connectionId: "connection-1",
    reconnectDelayMs: 10,
    onEvent,
  });
}

function connectionState(cursor: number) {
  return {
    event: "connection_state",
    data: {
      connection_id: "connection-1",
      agent_id: "gatekeeper-1",
      generation: 1,
      scope: "single",
      filter: "addressed",
      rooms: ["room-1"],
      cursor,
      position: cursor === 0 ? {} : { s: cursor },
      protocol: 9,
      heartbeat_interval_seconds: 10,
    },
  };
}

function messageFrame(sequence: number, addressed: boolean, body: string) {
  return {
    event: "message",
    id: sequence,
    data: {
      type: "message",
      room_id: "room-1",
      bridge_id: "mattermost",
      channel_type: "channel_public",
      sequence,
      position: { s: sequence },
      payload: {
        addressed,
        sender: "@switch-user-human:local",
        sender_name: "Moses",
        sender_kind: "user",
        message_id: `message-${sequence}`,
        body,
        timestamp: 1_799_000_000_000,
        thread_id: null,
        attachments: [],
      },
    },
  };
}

async function startFakeSwitch(
  onConnection: (
    socket: WebSocket,
    request: IncomingMessage,
    connectionNumber: number,
  ) => void = (socket) => socket.send(JSON.stringify(connectionState(0))),
  options: { healthStatus?: number; healthDelayMs?: number; postStatus?: number } = {},
): Promise<FakeSwitch> {
  const requests: RecordedRequest[] = [];
  const upgrades: { url: string; authorization?: string }[] = [];
  const sockets: WebSocket[] = [];
  const clientFrames: unknown[] = [];
  const server = createServer(async (request, response) => {
    const body = await readRequestBody(request);
    requests.push({
      method: request.method ?? "",
      url: request.url ?? "",
      ...(request.headers.authorization ? { authorization: request.headers.authorization } : {}),
      body,
    });
    if (request.method === "GET" && request.url === "/health") {
      if (options.healthDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.healthDelayMs));
      }
      response.statusCode = options.healthStatus ?? 200;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ status: response.statusCode === 200 ? "healthy" : "unhealthy" }));
      return;
    }
    if (request.method === "POST" && request.url === "/agents/gatekeeper-1/message") {
      response.statusCode = options.postStatus ?? 200;
      response.setHeader("content-type", "application/json");
      response.end(
        response.statusCode === 200
          ? JSON.stringify({ ok: true, event_id: "event-1" })
          : JSON.stringify({ detail: "message refused" }),
      );
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  const webSockets = new WebSocketServer({ noServer: true });
  server.on("upgrade", (request, socket, head) => {
    upgrades.push({
      url: request.url ?? "",
      ...(request.headers.authorization ? { authorization: request.headers.authorization } : {}),
    });
    webSockets.handleUpgrade(request, socket, head, (webSocket) => {
      sockets.push(webSocket);
      webSocket.on("message", (data) => clientFrames.push(JSON.parse(data.toString())));
      onConnection(webSocket, request, sockets.length - 1);
    });
  });
  await listen(server);
  const address = server.address() as AddressInfo;
  const fake: FakeSwitch = {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    upgrades,
    sockets,
    clientFrames,
    async close() {
      for (const socket of sockets) socket.terminate();
      webSockets.close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
  runningServers.push(fake);
  return fake;
}

async function listen(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

async function readRequestBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("timed out waiting for fake Switch state");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
