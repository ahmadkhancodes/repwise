/**
 * The only HTTP client in the app (sheet 13: UI never calls fetch). Talks to our Cloudflare Worker.
 *
 * - Base URL from EXPO_PUBLIC_API_URL.
 * - Access JWT (15 min) + rotating refresh token. Refresh is SINGLE-FLIGHT: the Worker revokes the
 *   whole session family when a rotated refresh token is reused (outside a 60 s grace window for
 *   lost replies), so any number of concurrent 401s (or near-expiry requests) share one
 *   /auth/refresh call, and a refresh whose reply was lost is retried once straight away.
 * - Timeouts, offline detection and typed errors (ApiError.kind). Nothing here blocks the UI:
 *   callers fire and forget, and local SQLite stays the source of truth.
 */
import { useConnectivity } from './connectivity';
import { emitSessionEvent } from './sessionEvents';
import {
  clearSession,
  loadSession,
  peekSession,
  saveSession,
  sessionFromResponse,
  type StoredSession,
  type TokenResponse,
} from './tokens';

export type ApiErrorKind =
  /** No network (fetch failed before any response). */
  | 'offline'
  /** No response within the timeout. */
  | 'timeout'
  /** The caller aborted. */
  | 'aborted'
  /** 401, or no session for a route that needs one. */
  | 'unauthorized'
  /** Any other non-2xx response; `code` is the server's `error` string. */
  | 'http'
  /** 2xx with a body that is not JSON. */
  | 'bad_response'
  /** EXPO_PUBLIC_API_URL is not set (treated like offline by callers). */
  | 'config';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly code: string | null;

  constructor(kind: ApiErrorKind, status: number | null = null, code: string | null = null) {
    super(code ? `${kind}: ${code}` : kind);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** True for errors that mean "try again later" (no network, timeout, server not configured). */
export function isNetworkError(e: unknown): boolean {
  return isApiError(e) && (e.kind === 'offline' || e.kind === 'timeout' || e.kind === 'config');
}

export type AuthMode =
  /** Never send a token. */
  | 'none'
  /** Send a valid token if there is a session (e.g. sign-in upgrading an anonymous account). */
  | 'optional'
  /** A session is required; refresh on expiry/401. */
  | 'required';

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined | null>;
  auth?: AuthMode;
  timeoutMs?: number;
  signal?: AbortSignal;
};

type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

type ApiConfig = {
  baseUrl: string;
  fetch: FetchFn;
  timeoutMs: number;
  now: () => number;
  /** Refresh this long before the access token's expiry. */
  refreshSkewMs: number;
};

const defaults = (): ApiConfig => ({
  baseUrl: process.env.EXPO_PUBLIC_API_URL ?? '',
  fetch: (input, init) => globalThis.fetch(input, init),
  timeoutMs: 15_000,
  now: () => Date.now(),
  refreshSkewMs: 30_000,
});

let config: ApiConfig = defaults();
let inflightRefresh: Promise<StoredSession> | null = null;

/** Override base URL / fetch / clock (tests, dev menu). */
export function configureApi(patch: Partial<ApiConfig>): void {
  config = { ...config, ...patch };
}

/** Tests only. */
export function resetApiForTests(): void {
  config = defaults();
  inflightRefresh = null;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const base = config.baseUrl.replace(/\/+$/, '');
  if (!base) throw new ApiError('config', null, 'no_api_url');
  let url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  if (query) {
    const qs = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    if (qs) url += `?${qs}`;
  }
  return url;
}

/** One HTTP round trip with timeout and offline mapping. Any response at all means we're online. */
async function send(path: string, opts: RequestOptions, token: string | null): Promise<Response> {
  const url = buildUrl(path, opts.query);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, opts.timeoutMs ?? config.timeoutMs);
  const onAbort = () => controller.abort();
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener('abort', onAbort);
  }
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await config.fetch(url, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
    useConnectivity.getState().setOnline(true, config.now());
    return res;
  } catch {
    if (timedOut) throw new ApiError('timeout');
    if (opts.signal?.aborted) throw new ApiError('aborted');
    useConnectivity.getState().setOnline(false);
    throw new ApiError('offline');
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text().catch(() => '');
  let body: unknown = undefined;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      if (res.ok) throw new ApiError('bad_response', res.status);
    }
  }
  if (!res.ok) {
    const code =
      body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : null;
    throw new ApiError(res.status === 401 ? 'unauthorized' : 'http', res.status, code);
  }
  return body as T;
}

/** The server no longer accepts our refresh token: drop it (local data stays) and tell everyone. */
async function expireSession(refreshToken: string): Promise<void> {
  if (peekSession()?.refreshToken !== refreshToken) return; // already replaced or cleared
  await clearSession();
  emitSessionEvent({ type: 'signedOut', reason: 'expired' });
}

async function doRefresh(): Promise<StoredSession> {
  const s = await loadSession();
  if (!s) throw new ApiError('unauthorized', null, 'no_session');
  const post = () =>
    send('/auth/refresh', { method: 'POST', body: { refreshToken: s.refreshToken } }, null);
  let res: Response;
  try {
    res = await post();
  } catch (e) {
    // The Worker may have rotated the token and only the reply was lost. Retrying at once lands
    // inside its reuse grace window, which hands back the same successor instead of revoking.
    if (!(isApiError(e) && (e.kind === 'timeout' || e.kind === 'offline'))) throw e;
    res = await post();
  }
  if (res.status === 401) {
    await expireSession(s.refreshToken);
    throw new ApiError('unauthorized', 401, 'session_expired');
  }
  const tokens = await parse<TokenResponse>(res);
  const next = sessionFromResponse(tokens, config.now());
  const current = peekSession();
  // Signed out (or signed in elsewhere) while refreshing: don't resurrect the old session.
  if (current && current.refreshToken !== s.refreshToken) return current;
  if (!current) throw new ApiError('unauthorized', null, 'no_session');
  await saveSession(next);
  return next;
}

/**
 * Single-flight refresh: every caller during one refresh gets the same promise, so the rotated
 * refresh token is used exactly once.
 */
export function refreshSession(): Promise<StoredSession> {
  if (!inflightRefresh) {
    inflightRefresh = doRefresh().finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

async function accessToken(mode: AuthMode): Promise<string | null> {
  if (mode === 'none') return null;
  const s = await loadSession();
  if (!s) {
    if (mode === 'required') throw new ApiError('unauthorized', null, 'no_session');
    return null;
  }
  if (s.accessExpiresAt - config.refreshSkewMs > config.now()) return s.accessToken;
  try {
    return (await refreshSession()).accessToken;
  } catch (e) {
    if (mode === 'optional' && isApiError(e) && e.kind === 'unauthorized') return null;
    throw e;
  }
}

/** After a 401 with `used`: reuse a token another request already refreshed, else refresh once. */
async function tokenAfter401(used: string): Promise<string> {
  if (inflightRefresh) return (await inflightRefresh).accessToken;
  const current = peekSession();
  if (current && current.accessToken !== used) return current.accessToken;
  return (await refreshSession()).accessToken;
}

/** Call the Worker. Throws ApiError; never touches local data. */
export async function request<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const mode = opts.auth ?? 'none';
  const token = await accessToken(mode);
  let res = await send(path, opts, token);
  if (res.status === 401 && token) {
    const fresh = await tokenAfter401(token);
    res = await send(path, opts, fresh);
  }
  return parse<T>(res);
}

export const api = {
  request,
  get: <T>(path: string, opts: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(path, { ...opts, method: 'POST', body: body ?? {} }),
  delete: <T>(path: string, opts: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(path, { ...opts, method: 'DELETE' }),
};
