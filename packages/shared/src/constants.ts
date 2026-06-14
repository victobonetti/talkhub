/** Constantes compartilhadas entre client e server. */

/** Frequência do tick de simulação da sala (Hz). */
export const TICK_RATE = 15;
export const TICK_MS = Math.round(1000 / TICK_RATE);

/** Raio de chat por proximidade (em células). Configurável pelo host. */
export const DEFAULT_CHAT_RADIUS = 5;
export const MIN_CHAT_RADIUS = 1;
export const MAX_CHAT_RADIUS = 30;

/** Tamanho máximo de uma mensagem de chat. */
export const MAX_CHAT_LEN = 500;

/** Avatar 16x16 monocromático: 256 bits = 32 bytes (1 bit por pixel). */
export const AVATAR_SIZE = 16;
export const AVATAR_BITS_BYTES = 32;

/** Lado da célula de colisão/movimento, em pixels. */
export const CELL_SIZE = 16;

/** Quantos ouvintes mostrar na barra de proximidade antes do indicador "+X". */
export const MAX_LISTENERS_SHOWN = 5;

/** Nome do tipo de Room registrado no Colyseus. */
export const ROOM_AMBIENTE = "ambiente";

/** Dimensões do mundo (em células de 16px). */
export const DEFAULT_WORLD_W_CELLS = 24;
export const DEFAULT_WORLD_H_CELLS = 16;
export const MIN_WORLD_CELLS = 4;
export const MAX_WORLD_CELLS = 64;

/** Máximo de cores na paleta da arte de um mundo. */
export const MAX_PALETTE = 64;

/** Limites de texto. */
export const MAX_SERVER_NAME = 60;
export const MAX_AMBIENTE_NAME = 60;
