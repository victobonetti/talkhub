import { CELL_SIZE } from "./constants.js";

/**
 * Helpers de dados de mapa (sem PNG — tudo dado cru renderizado em canvas).
 *
 * - Arte: 1 byte de índice de paleta por pixel. Valor 0 = vazio/transparente;
 *   valor v>=1 referencia paletteColors[v-1].
 * - Colisão: bitset de células (1 bit por célula de 16px).
 */

/** Empacota um array de 0/1 em bitset de `ceil(count/8)` bytes. */
export function packBitset(bits: ArrayLike<number>, count: number): Uint8Array {
  const bytes = new Uint8Array(Math.ceil(count / 8));
  for (let i = 0; i < count; i++) {
    if (bits[i]) bytes[i >> 3] |= 1 << (i & 7);
  }
  return bytes;
}

/** Desempacota um bitset de volta para `count` valores 0/1. */
export function unpackBitset(bytes: Uint8Array, count: number): Uint8Array {
  const bits = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    bits[i] = (bytes[i >> 3] >> (i & 7)) & 1;
  }
  return bits;
}

export const cellsToPx = (cells: number): number => cells * CELL_SIZE;
export const pxToCells = (px: number): number => Math.floor(px / CELL_SIZE);

/** Quantidade de bytes esperada para a colisão dado o tamanho em células. */
export function collisionBytesFor(wCells: number, hCells: number): number {
  return Math.ceil((wCells * hCells) / 8);
}

/** Verifica se uma célula é bloqueada (colisão). */
export function isBlocked(
  collision: Uint8Array,
  cellX: number,
  cellY: number,
  wCells: number,
): boolean {
  const i = cellY * wCells + cellX;
  return ((collision[i >> 3] >> (i & 7)) & 1) === 1;
}
