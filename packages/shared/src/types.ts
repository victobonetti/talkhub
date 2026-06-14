/** Tipos de domínio e payloads de mensagens server -> client (fora do Schema). */

export type Dir = "up" | "down" | "left" | "right";

/** Metadados de um ambiente (mundo) enviados ao cliente ao entrar. */
export interface AmbienteMeta {
  id: string;
  name: string;
  widthPx: number;
  heightPx: number;
  spawnX: number;
  spawnY: number;
  /** Raio de chat por proximidade, em células (círculo Euclidiano). */
  chatRadius: number;
}

/** Enviado uma vez no onJoin. Arte/colisão chegam em M3. */
export interface InitPayload {
  you: string; // sessionId do próprio jogador
  ambiente: AmbienteMeta;
}

/** Avatar de um jogador (monocromático + cor única). Enviado 1x por jogador. */
export interface AvatarPayload {
  id: string; // sessionId
  userId: string;
  displayName: string;
  bits: string; // base64 dos 32 bytes (silhueta on/off)
  color: string; // cor única de exibição (hex)
}

/** Quem está no MEU raio agora (barra de ouvintes). */
export interface NearbyPayload {
  ids: string[];
}

/** Mensagem de chat relayada — apenas para quem está em raio. Não persistida. */
export interface ChatPayload {
  fromId: string;
  displayName: string;
  text: string;
  ts: number;
}

/** Correção autoritativa de posição quando a predição do cliente diverge. */
export interface CorrectionPayload {
  cellX: number;
  cellY: number;
  seq: number;
}

/** Jogador pisou num portal: cliente deve trocar de ambiente. */
export interface PortalPayload {
  targetAmbienteId: string;
  spawnX: number;
  spawnY: number;
}

/** Nomes das mensagens server -> client. */
export const ServerMessage = {
  Init: "init",
  Avatar: "avatar",
  Nearby: "nearby",
  Chat: "chat",
  Correction: "correction",
  Portal: "portal",
} as const;
export type ServerMessageName = (typeof ServerMessage)[keyof typeof ServerMessage];

/** Nomes das mensagens client -> server. */
export const ClientMessage = {
  Move: "move",
  Chat: "chat",
} as const;
export type ClientMessageName = (typeof ClientMessage)[keyof typeof ClientMessage];
