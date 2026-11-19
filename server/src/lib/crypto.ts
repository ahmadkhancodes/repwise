// Small Web Crypto helpers (Workers + Node 20+). No secrets are ever logged.
const enc = new TextEncoder();

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(str: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(str)) throw new Error('bad base64url');
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  return b64Decode(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
}

export function b64Decode(str: string): Uint8Array {
  const bin = atob(str.replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function b64Encode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const data = typeof input === 'string' ? enc.encode(input) : input;
  return hex(await crypto.subtle.digest('SHA-256', data as BufferSource));
}

export async function hmacSha256Hex(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}

/** Constant-time string comparison (length leak only). */
export function safeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const n = Math.max(ab.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

/** RFC 9562 UUID v7 (48-bit ms timestamp + random). */
export function uuidv7(now = Date.now()): string {
  const b = randomBytes(16);
  let ts = BigInt(now);
  for (let i = 5; i >= 0; i--) {
    b[i] = Number(ts & 0xffn);
    ts >>= 8n;
  }
  b[6] = (b[6]! & 0x0f) | 0x70;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Uniform random numeric code (rejection sampling, no modulo bias). */
export function randomDigits(len: number): string {
  let out = '';
  while (out.length < len) {
    const [x] = randomBytes(1);
    if (x! < 250) out += String(x! % 10);
  }
  return out;
}

/** Deterministic JSON with sorted keys (for hashing). */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .filter((k) => o[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
    .join(',')}}`;
}
