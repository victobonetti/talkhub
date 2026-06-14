import { z } from "zod";
import { base64ToBytes, isValidAvatarBase64, isValidColor } from "./avatar.js";
import {
  CELL_SIZE,
  MAX_AMBIENTE_NAME,
  MAX_PALETTE,
  MAX_SERVER_NAME,
  MAX_WORLD_CELLS,
  MIN_CHAT_RADIUS,
  MIN_WORLD_CELLS,
  MAX_CHAT_RADIUS,
} from "./constants.js";
import { collisionBytesFor } from "./mapdata.js";

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

// --- Servidores & ambientes (mapas) ---

const cellDim = z
  .number()
  .int()
  .min(MIN_WORLD_CELLS)
  .max(MAX_WORLD_CELLS);

const HEX = z.string().refine(isValidColor, "cor deve ser hex #RRGGBB");

function base64Len(b64: string): number {
  try {
    return base64ToBytes(b64).length;
  } catch {
    return -1;
  }
}

export const AmbienteCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_AMBIENTE_NAME),
    wCells: cellDim,
    hCells: cellDim,
    /** cores usáveis da paleta (índice 0 da arte = vazio/transparente). */
    palette: z.array(HEX).max(MAX_PALETTE),
    /** 1 byte de índice por pixel (wCells*hCells*256), base64. */
    art: z.string(),
    /** bitset de colisão por célula, base64. */
    collision: z.string(),
    spawnX: z.number().int().nonnegative(),
    spawnY: z.number().int().nonnegative(),
    chatRadius: z.number().int().min(MIN_CHAT_RADIUS).max(MAX_CHAT_RADIUS),
  })
  .superRefine((v, ctx) => {
    const wpx = v.wCells * CELL_SIZE;
    const hpx = v.hCells * CELL_SIZE;
    if (base64Len(v.art) !== wpx * hpx) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "art com tamanho inválido", path: ["art"] });
    }
    if (base64Len(v.collision) !== collisionBytesFor(v.wCells, v.hCells)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "collision com tamanho inválido",
        path: ["collision"],
      });
    }
    if (v.spawnX >= v.wCells || v.spawnY >= v.hCells) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "spawn fora do mundo", path: ["spawnX"] });
    }
  });
export type AmbienteCreateInput = z.infer<typeof AmbienteCreateSchema>;

export const ServerCreateSchema = z.object({
  name: z.string().trim().min(1).max(MAX_SERVER_NAME),
  ambiente: AmbienteCreateSchema,
});
export type ServerCreateInput = z.infer<typeof ServerCreateSchema>;

/** Item da lista de servidores. */
export interface ServerListItem {
  id: string;
  name: string;
  ownerName: string;
  ambienteCount: number;
  /** jogadores online no servidor (soma das salas ativas). */
  playerCount: number;
  /** primeiro ambiente (para preview e entrada rápida). */
  firstAmbienteId: string | null;
  createdAt: string;
}

/** Metadados de ambiente para a lista/abertura. */
export interface AmbienteMetaDto {
  id: string;
  name: string;
  wCells: number;
  hCells: number;
  spawnX: number;
  spawnY: number;
  chatRadius: number;
}

export interface PortalDto {
  id: string;
  cellX: number;
  cellY: number;
  targetAmbienteId: string;
  targetSpawnX: number;
  targetSpawnY: number;
}

/** Ambiente completo para carregar no jogo/editor. */
export interface AmbienteFullDto extends AmbienteMetaDto {
  palette: string[];
  art: string; // base64
  collision: string; // base64
  portals: PortalDto[];
}

export const PortalCreateSchema = z.object({
  cellX: z.number().int().nonnegative(),
  cellY: z.number().int().nonnegative(),
  targetAmbienteId: z.string().uuid(),
  targetSpawnX: z.number().int().nonnegative(),
  targetSpawnY: z.number().int().nonnegative(),
});
export type PortalCreateInput = z.infer<typeof PortalCreateSchema>;
