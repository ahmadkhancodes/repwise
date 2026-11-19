import { getRandomBytes } from 'expo-crypto';

let lastMs = 0;
let seq = 0;

/**
 * RFC 9562 UUID v7: 48-bit ms timestamp, version 7, variant 10, random tail. IDs created in the
 * same millisecond still sort in creation order (12-bit counter in rand_a). Random bytes come from
 * the platform CSPRNG (expo-crypto).
 */
export function uuidv7(now: number = Date.now()): string {
  if (now === lastMs) {
    seq = (seq + 1) & 0xfff;
  } else {
    lastMs = now;
    seq = 0;
  }
  const b = getRandomBytes(16);
  const ms = Math.max(0, Math.floor(now));
  b[0] = Math.floor(ms / 2 ** 40) & 0xff;
  b[1] = Math.floor(ms / 2 ** 32) & 0xff;
  b[2] = (ms >>> 24) & 0xff;
  b[3] = (ms >>> 16) & 0xff;
  b[4] = (ms >>> 8) & 0xff;
  b[5] = ms & 0xff;
  b[6] = 0x70 | ((seq >>> 8) & 0x0f);
  b[7] = seq & 0xff;
  b[8] = 0x80 | (b[8]! & 0x3f);
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Millisecond timestamp encoded in a v7 id (for tests and debugging). */
export function uuidv7Time(id: string): number {
  return parseInt(id.replace(/-/g, '').slice(0, 12), 16);
}

/** Random lowercase hex string (nonces, device ids). */
export function randomHex(bytes: number): string {
  return Array.from(getRandomBytes(bytes), (x) => x.toString(16).padStart(2, '0')).join('');
}
