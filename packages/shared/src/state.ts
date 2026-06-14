import { Schema, MapSchema, type } from "@colyseus/schema";
import type { Dir } from "./types.js";

/**
 * Estado sincronizado de um jogador (state-sync binário do Colyseus).
 * Apenas dados de movimento entram aqui. Avatar e chat NÃO são sincronizados
 * pelo Schema (avatar vai por mensagem 1x; chat é efêmero/por proximidade).
 */
export class PlayerState extends Schema {
  @type("string") id = "";
  @type("string") userId = "";
  @type("string") displayName = "";
  @type("number") cellX = 0;
  @type("number") cellY = 0;
  @type("string") dir: Dir = "down";
}

/** Estado da sala de um ambiente: mapa de jogadores conectados. */
export class AmbienteState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}
