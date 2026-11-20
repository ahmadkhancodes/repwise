/**
 * Structured JSON logs (one line per event) for Workers Logs / `wrangler tail`.
 *
 * - Every line carries the request id when there is one, so a client report ("x-request-id: …")
 *   leads straight to the server lines.
 * - Secrets never reach a log line: keys that name credentials are masked whatever their value, and
 *   values that look like credentials (JWTs, API keys, refresh tokens, emails) are masked wherever
 *   they appear. Callers should still log only what they need.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  /** A logger whose lines all carry `fields` (e.g. the request id). */
  child(fields: LogFields): Logger;
}

/** Keys whose values are always masked (case-insensitive substring match). */
const SECRET_KEY =
  /(authorization|cookie|password|passwd|secret|token|api[-_]?key|apikey|private[-_]?key|signature|signed(payload|transaction|renewal)|assertion|nonce|code|otp|email|uri|dsn)/i;
/** Values that look like credentials, wherever they appear. */
const SECRET_VALUE: RegExp[] = [
  /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, // JWT / JWS
  /sk-ant-[A-Za-z0-9_-]+/g, // Anthropic keys
  /\bre_[A-Za-z0-9_]{8,}/g, // Resend keys
  /\brt_[A-Za-z0-9_-]{16,}/g, // our refresh tokens
  /mongodb(\+srv)?:\/\/[^\s"']+/gi, // connection strings
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, // emails (PII)
];
/** Secrets in query strings: keep the parameter name, mask the value. */
const SECRET_QUERY = /([?&](?:token|key|secret|code|cursor)=)[^&\s"']+/gi;
const MASK = '[redacted]';
const MAX_STRING = 500;
const MAX_DEPTH = 5;

export function redactString(s: string): string {
  let out = s.length > MAX_STRING ? `${s.slice(0, MAX_STRING)}…` : s;
  out = out.replace(SECRET_QUERY, `$1${MASK}`);
  for (const re of SECRET_VALUE) out = out.replace(re, MASK);
  return out;
}

/** Deep copy with secrets masked. Errors become { name, message } (no stacks: they can carry data). */
export function redact(v: unknown, depth = 0): unknown {
  if (v === null || v === undefined || typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'string') return redactString(v);
  if (typeof v === 'bigint') return String(v);
  if (v instanceof Error) return { name: v.name, message: redactString(v.message) };
  if (depth >= MAX_DEPTH) return '[depth]';
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => redact(x, depth + 1));
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) && !SAFE_KEYS.has(k) ? MASK : redact(x, depth + 1);
    }
    return out;
  }
  return String(v);
}

/** Field names we set ourselves that merely contain a secret-ish word. */
const SAFE_KEYS = new Set(['reqId', 'statusCode', 'errorCode', 'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'maxTokens', 'tokens']);

export type LogSink = (level: LogLevel, line: string) => void;

const consoleSink: LogSink = (level, line) => {
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
};

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger(opts: { sink?: LogSink; base?: LogFields; level?: LogLevel; clock?: () => number } = {}): Logger {
  const sink = opts.sink ?? consoleSink;
  const base = opts.base ?? {};
  const min = ORDER[opts.level ?? 'info'];
  const clock = opts.clock ?? Date.now;
  const emit = (level: LogLevel, msg: string, fields?: LogFields) => {
    if (ORDER[level] < min) return;
    try {
      const rec = redact({ ...base, ...(fields ?? {}) }) as LogFields;
      sink(level, JSON.stringify({ ts: new Date(clock()).toISOString(), level, msg, ...rec }));
    } catch {
      // Logging must never break a request.
    }
  };
  return {
    debug: (m, f) => emit('debug', m, f),
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f),
    child: (fields) => createLogger({ sink, base: { ...base, ...fields }, level: opts.level ?? 'info', clock }),
  };
}

/** Test helper: keeps lines in memory. */
export function memoryLogger(level: LogLevel = 'debug'): Logger & { lines: { level: LogLevel; line: string }[] } {
  const lines: { level: LogLevel; line: string }[] = [];
  const logger = createLogger({ sink: (l, line) => lines.push({ level: l, line }), level });
  return Object.assign(logger, { lines });
}

const REQ_ID = /^[A-Za-z0-9._:-]{8,64}$/;

/** Accept a well-formed client/edge request id, else make one. */
export function requestId(incoming: string | undefined | null): string {
  if (incoming && REQ_ID.test(incoming)) return incoming;
  return crypto.randomUUID();
}
