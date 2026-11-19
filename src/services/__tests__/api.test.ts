import {
  api,
  ApiError,
  configureApi,
  isNetworkError,
  refreshSession,
  resetApiForTests,
} from '@/services/api';
import { useConnectivity } from '@/services/connectivity';
import { onSessionEvent, type SessionEvent } from '@/services/sessionEvents';
import { loadSession, peekSession, resetTokensForTests, saveSession } from '@/services/tokens';

import { createFakeFetch, tokenResponse } from '../../../test/fakeFetch';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const secureStore = require('expo-secure-store') as { __reset: () => void };

const NOW = 1_763_550_000_000;
let fake: ReturnType<typeof createFakeFetch>;

async function signedIn(accessExpiresAt = NOW + 600_000) {
  await saveSession({
    accessToken: 'at-0',
    refreshToken: 'rt-0',
    accessExpiresAt,
    user: { id: 'user-1', email: 'a@b.co', anonymous: false },
  });
}

beforeEach(() => {
  secureStore.__reset();
  resetTokensForTests();
  resetApiForTests();
  fake = createFakeFetch();
  configureApi({ baseUrl: `${fake.base}/`, fetch: fake.fetch, now: () => NOW });
  useConnectivity.setState({ online: null, lastOnlineAt: null });
});

describe('api basics', () => {
  it('builds URLs with query, sends JSON and parses the reply', async () => {
    fake.on('GET /sync/pull', () => ({ status: 200, body: { ok: 1 } }));
    await signedIn();
    const r = await api.get('/sync/pull', {
      auth: 'required',
      query: { since: 5, cursor: undefined },
    });
    expect(r).toEqual({ ok: 1 });
    expect(fake.calls[0]).toMatchObject({ query: '?since=5', auth: 'Bearer at-0' });
    expect(useConnectivity.getState().online).toBe(true);
  });

  it('maps server errors to typed ApiError with the server code', async () => {
    fake.on('POST /auth/email/start', () => ({ status: 429, body: { error: 'rate_limited' } }));
    await expect(api.post('/auth/email/start', { email: 'x@y.co' })).rejects.toMatchObject({
      kind: 'http',
      status: 429,
      code: 'rate_limited',
    });
  });

  it('204 resolves undefined', async () => {
    fake.on('DELETE /account', () => ({ status: 204 }));
    await signedIn();
    await expect(api.delete('/account', { auth: 'required' })).resolves.toBeUndefined();
  });

  it('offline: network failure → offline error and connectivity flag', async () => {
    fake.setOffline(true);
    const e = await api.get('/health').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).kind).toBe('offline');
    expect(isNetworkError(e)).toBe(true);
    expect(useConnectivity.getState().online).toBe(false);
  });

  it('times out slow requests', async () => {
    fake.on('GET /health', () => new Promise(() => undefined));
    const e = await api.get('/health', { timeoutMs: 20 }).catch((x: unknown) => x);
    expect((e as ApiError).kind).toBe('timeout');
  });

  it('missing base URL is a config error (treated as offline by callers)', async () => {
    configureApi({ baseUrl: '' });
    const e = await api.get('/health').catch((x: unknown) => x);
    expect(e).toMatchObject({ kind: 'config', code: 'no_api_url' });
    expect(isNetworkError(e)).toBe(true);
  });

  it('auth required without a session fails fast without a request', async () => {
    await expect(api.get('/billing/entitlement', { auth: 'required' })).rejects.toMatchObject({
      kind: 'unauthorized',
      code: 'no_session',
    });
    expect(fake.calls).toHaveLength(0);
  });
});

describe('single-flight refresh', () => {
  it('concurrent 401s share ONE /auth/refresh and all retry with the new token', async () => {
    await signedIn();
    let refreshes = 0;
    fake.on('POST /auth/refresh', async (c) => {
      refreshes++;
      expect(c.body).toEqual({ refreshToken: 'rt-0' });
      await new Promise((r) => setTimeout(r, 10));
      return { status: 200, body: tokenResponse(1) };
    });
    fake.on('GET /sync/pull', (c) =>
      c.auth === 'Bearer at-1'
        ? { status: 200, body: { ok: true } }
        : { status: 401, body: { error: 'unauthorized' } },
    );
    const results = await Promise.all(
      Array.from({ length: 5 }, () => api.get('/sync/pull', { auth: 'required' })),
    );
    expect(results).toEqual(Array(5).fill({ ok: true }));
    expect(refreshes).toBe(1);
    expect(fake.callsTo('POST /auth/refresh')).toHaveLength(1);
    expect(peekSession()).toMatchObject({ accessToken: 'at-1', refreshToken: 'rt-1' });
  });

  it('a late 401 after the refresh finished reuses the new token instead of refreshing again', async () => {
    await signedIn();
    fake.on('POST /auth/refresh', () => ({ status: 200, body: tokenResponse(1) }));
    let first = true;
    fake.on('GET /a', (c) =>
      c.auth === 'Bearer at-1' ? { status: 200, body: 'a' } : { status: 401 },
    );
    fake.on('GET /b', async (c) => {
      if (first) {
        first = false;
        // reply 401 only after /a has refreshed
        await new Promise((r) => setTimeout(r, 20));
        return { status: 401 };
      }
      return c.auth === 'Bearer at-1' ? { status: 200, body: 'b' } : { status: 401 };
    });
    const [a, b] = await Promise.all([
      api.get('/a', { auth: 'required' }),
      (async () => api.get('/b', { auth: 'required' }))(),
    ]);
    expect([a, b]).toEqual(['a', 'b']);
    expect(fake.callsTo('POST /auth/refresh')).toHaveLength(1);
  });

  it('refreshes proactively before expiry, once for parallel calls', async () => {
    await signedIn(NOW + 10_000); // inside the 30 s skew
    fake.on('POST /auth/refresh', () => ({ status: 200, body: tokenResponse(2) }));
    fake.on('GET /x', (c) => ({ status: 200, body: c.auth }));
    const r = await Promise.all([
      api.get('/x', { auth: 'required' }),
      api.get('/x', { auth: 'required' }),
    ]);
    expect(r).toEqual(['Bearer at-2', 'Bearer at-2']);
    expect(fake.callsTo('POST /auth/refresh')).toHaveLength(1);
  });

  it('a rejected refresh token signs out of sync (tokens cleared, event emitted)', async () => {
    await signedIn();
    const events: SessionEvent[] = [];
    const off = onSessionEvent((e) => events.push(e));
    fake.on('POST /auth/refresh', () => ({ status: 401, body: { error: 'token_reused' } }));
    fake.on('GET /x', () => ({ status: 401 }));
    await expect(api.get('/x', { auth: 'required' })).rejects.toMatchObject({
      kind: 'unauthorized',
      code: 'session_expired',
    });
    off();
    expect(peekSession()).toBeNull();
    expect(await loadSession()).toBeNull();
    expect(events).toEqual([{ type: 'signedOut', reason: 'expired' }]);
  });

  it('a refresh whose reply was lost is retried at once (server grace returns the same successor)', async () => {
    await signedIn(NOW - 1);
    configureApi({ timeoutMs: 20 });
    let n = 0;
    fake.on('POST /auth/refresh', (c) => {
      n++;
      expect(c.body).toEqual({ refreshToken: 'rt-0' });
      if (n === 1) return new Promise(() => undefined); // rotated server-side, reply lost
      return { status: 200, body: tokenResponse(1) };
    });
    const s = await refreshSession();
    expect(n).toBe(2);
    expect(s.refreshToken).toBe(tokenResponse(1).refreshToken);
    expect(peekSession()?.refreshToken).toBe(tokenResponse(1).refreshToken);
  });

  it('offline during refresh keeps the tokens', async () => {
    await signedIn(NOW - 1);
    fake.setOffline(true);
    await expect(refreshSession()).rejects.toMatchObject({ kind: 'offline' });
    expect(peekSession()).toMatchObject({ refreshToken: 'rt-0' });
  });

  it('optional auth continues without a token when the session is gone', async () => {
    await signedIn(NOW - 1);
    fake.on('POST /auth/refresh', () => ({ status: 401 }));
    fake.on('POST /auth/google', (c) => ({ status: 200, body: { auth: c.auth } }));
    await expect(api.post('/auth/google', { idToken: 'x' }, { auth: 'optional' })).resolves.toEqual(
      {
        auth: null,
      },
    );
  });
});
