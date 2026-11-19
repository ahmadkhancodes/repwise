import type { Context } from 'hono';

/** An error that is safe to show to clients. Anything else becomes a generic 500. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
    readonly headers?: Record<string, string>,
  ) {
    super(message ?? code);
  }
}

export const badRequest = (code = 'bad_request', msg?: string) => new HttpError(400, code, msg);
export const unauthorized = (code = 'unauthorized') => new HttpError(401, code);
export const forbidden = (code = 'forbidden') => new HttpError(403, code);
export const notFound = () => new HttpError(404, 'not_found');

export const KB = 1024;

/** Read the raw body with a hard byte cap (413), whether or not Content-Length is sent. */
export async function readBody(c: Context, maxBytes: number): Promise<Uint8Array> {
  const len = c.req.header('content-length');
  if (len !== undefined) {
    const n = Number(len);
    if (!Number.isFinite(n) || n < 0) throw badRequest('bad_content_length');
    if (n > maxBytes) throw new HttpError(413, 'payload_too_large');
  }
  const body = c.req.raw.body;
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new HttpError(413, 'payload_too_large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const ch of chunks) {
    out.set(ch, off);
    off += ch.byteLength;
  }
  return out;
}

/** Read and parse a JSON object body. Malformed JSON → 400; oversize → 413. */
export async function readJson(c: Context, maxBytes = 32 * KB): Promise<Record<string, unknown>> {
  const raw = await readBody(c, maxBytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  } catch {
    throw badRequest('malformed_json');
  }
  if (!isPlainObject(parsed)) throw badRequest('expected_object');
  return parsed;
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function str(body: Record<string, unknown>, key: string, opts: { max?: number; optional?: boolean } = {}): string {
  const v = body[key];
  if (v === undefined || v === null) {
    if (opts.optional) return '';
    throw badRequest('missing_field', `${key} is required`);
  }
  if (typeof v !== 'string' || v.length === 0) throw badRequest('invalid_field', `${key} must be a non-empty string`);
  if (v.length > (opts.max ?? 4096)) throw badRequest('invalid_field', `${key} is too long`);
  return v;
}

export function clientIp(c: Context): string {
  return c.req.header('cf-connecting-ip') ?? 'unknown';
}
