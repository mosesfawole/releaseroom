import { z } from "zod";

export const switchPositionSchema = z.record(z.string(), z.number().int().safe());

export const switchSocketFrameSchema = z.object({
  event: z.string(),
  data: z.record(z.string(), z.unknown()),
  id: z.union([z.number().int().safe(), z.string()]).optional(),
});

export const connectionStateSchema = z
  .object({
    connection_id: z.string(),
    generation: z.number().int().safe().optional(),
    cursor: z.number().int().nonnegative(),
    position: switchPositionSchema.optional(),
    rooms: z.array(z.string()),
  })
  .passthrough();

export const messageFrameDataSchema = z
  .object({
    type: z.literal("message"),
    room_id: z.string(),
    sequence: z.number().int().nonnegative().optional(),
    position: switchPositionSchema.optional(),
    payload: z
      .object({
        addressed: z.boolean(),
        sender: z.string(),
        sender_name: z.string(),
        sender_kind: z.string().nullable().optional(),
        message_id: z.string(),
        body: z.string(),
        timestamp: z.number(),
        thread_id: z.string().nullable().optional(),
        attachments: z.array(z.unknown()).optional(),
      })
      .passthrough(),
  })
  .passthrough();

export const gapFrameDataSchema = z
  .object({
    from_sequence: z.number().int().safe(),
    resumed_at: z.number().int().safe().optional(),
    resumed_position: switchPositionSchema.optional(),
    reason: z.string(),
    rooms: z.array(z.string()).optional(),
  })
  .passthrough();

export const postMessageResponseSchema = z.object({
  ok: z.literal(true),
  event_id: z.string(),
});

export type SwitchSocketFrame = z.infer<typeof switchSocketFrameSchema>;

export type SwitchMessageEvent = {
  type: "message";
  roomId: string;
  messageId: string;
  senderId: string;
  senderName: string;
  senderKind: string | null;
  content: string;
  threadId: string | null;
};

export type SwitchGapEvent = {
  type: "gap";
  fromSequence: number;
  resumedAt?: number;
  resumedPosition?: Record<string, number>;
  reason: string;
  rooms?: string[];
};

export type SwitchConnectionErrorEvent = {
  type: "connection_error";
  error: string;
};

export type SwitchEvent = SwitchMessageEvent | SwitchGapEvent | SwitchConnectionErrorEvent;

