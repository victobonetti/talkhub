import { AVATAR_SIZE, AVATAR_BITS_BYTES } from "./constants.js";

/** Helpers do avatar 16x16 monocromático (silhueta on/off) + cor única. */

export const AVATAR_PIXELS = AVATAR_SIZE * AVATAR_SIZE; // 256

/** Empacota 256 pixels (0/1) em 32 bytes (1 bit por pixel). */
export function packBits(pixels: ArrayLike<number>): Uint8Array {
  const bytes = new Uint8Array(AVATAR_BITS_BYTES);
  for (let i = 0; i < AVATAR_PIXELS; i++) {
    if (pixels[i]) bytes[i >> 3] |= 1 << (i & 7);
  }
  return bytes;
}

/** Desempacota 32 bytes em 256 pixels (0/1). */
export function unpackBits(bytes: Uint8Array): Uint8Array {
  const pixels = new Uint8Array(AVATAR_PIXELS);
  for (let i = 0; i < AVATAR_PIXELS; i++) {
    pixels[i] = (bytes[i >> 3] >> (i & 7)) & 1;
  }
  return pixels;
}

/** base64 portável (browser e Node). */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Valida que o base64 decodifica para exatamente 32 bytes. */
export function isValidAvatarBase64(b64: string): boolean {
  try {
    return base64ToBytes(b64).length === AVATAR_BITS_BYTES;
  } catch {
    return false;
  }
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
export function isValidColor(c: string): boolean {
  return HEX_COLOR.test(c);
}

/** Gera uma silhueta aleatória simétrica (espelhada na horizontal). */
export function randomAvatarPixels(density = 0.5): Uint8Array {
  const px = new Uint8Array(AVATAR_PIXELS);
  const half = AVATAR_SIZE / 2;
  for (let y = 0; y < AVATAR_SIZE; y++) {
    for (let x = 0; x < half; x++) {
      const on = Math.random() < density ? 1 : 0;
      px[y * AVATAR_SIZE + x] = on;
      px[y * AVATAR_SIZE + (AVATAR_SIZE - 1 - x)] = on;
    }
  }
  return px;
}

/** Cor aleatória agradável (hex). */
export function randomColor(): string {
  const h = Math.floor(Math.random() * 360);
  const s = 60 + Math.floor(Math.random() * 30);
  const l = 45 + Math.floor(Math.random() * 15);
  return hslToHex(h, s, l);
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const c = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
