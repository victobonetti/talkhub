import { z } from "zod";
import { MAX_CHAT_LEN } from "./constants.js";

/** Schemas zod para validar mensagens client -> server no servidor. */

export const DirSchema = z.enum(["up", "down", "left", "right"]);

export const MoveMessageSchema = z.object({
  dir: DirSchema,
  /** sequência incremental do cliente para reconciliação. */
  seq: z.number().int().nonnegative(),
});
export type MoveMessageInput = z.infer<typeof MoveMessageSchema>;

export const ChatMessageSchema = z.object({
  text: z.string().trim().min(1).max(MAX_CHAT_LEN),
});
export type ChatMessageInput = z.infer<typeof ChatMessageSchema>;

/** Opções enviadas no join (M0: só displayName; auth real vem no M1). */
export const JoinOptionsSchema = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
});
export type JoinOptions = z.infer<typeof JoinOptionsSchema>;
