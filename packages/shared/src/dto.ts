import { z } from "zod";
import { isValidAvatarBase64, isValidColor } from "./avatar.js";

/** DTOs das rotas REST (auth + avatar), reusados por server e web. */

export const GuestLoginSchema = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
});
export type GuestLoginInput = z.infer<typeof GuestLoginSchema>;

export const AvatarUpdateSchema = z.object({
  bits: z.string().refine(isValidAvatarBase64, "bits deve ser base64 de 32 bytes"),
  color: z.string().refine(isValidColor, "cor deve ser hex #RRGGBB"),
});
export type AvatarUpdateInput = z.infer<typeof AvatarUpdateSchema>;

/** Representação pública de um usuário (sem dados sensíveis). */
export interface PublicUser {
  id: string;
  kind: "google" | "guest";
  displayName: string;
}

export interface AvatarDto {
  bits: string; // base64 dos 32 bytes
  color: string; // hex
}
