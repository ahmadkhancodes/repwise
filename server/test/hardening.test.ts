/**
 * Security and observability pass: zod input validation on every route, JWT algorithm pinning,
 * CORS policy, request ids, rate limits on admin/webhook routes, authz on user-scoped data,
 * webhook payload checks, and "no secrets in logs".
 */
import { SignJWT, generateKeyPair } from 'jose';
import { describe, expect, it } from 'vitest';
import type { AppleStore } from '../src/billing/apple';
import { pubsubVerifier } from '../src/billing/play';
import { b64Encode } from '../src/lib/crypto';
import { redact, redactString } from '../src/lib/log';
import { call, setup, signInEmail, GOOGLE_AUD } from './helpers';

const SECRET = 'test-secret-that-is-long-enough-0123456789';

describe('zod validation on every input', () => {
  it('rejects bad bodies with stable codes (never zod text), per route', async () => {
    const t = await setup();
    const s = await signInEmail(t, 'z@example.com');
    const tok = { token: s.accessToken };
    const cases: [string, string, unknown, string, Record<string, unknown>?][] = [
      ['POST', '/auth/anonymous', { deviceId: 'bad id with spaces' }, 'invalid_device_id'],
      ['POST', '/auth/google', { idToken: 42 }, 'invalid_id_token'],
      ['POST', '/auth/google', { idToken: 'x'.repeat(9000) }, 'invalid_id_token'],
      ['POST', '/auth/apple', { identityToken: 'a.b.c', nonce: 'short' }, 'invalid_nonce'],
      ['POST', '/auth/email/start', { email: ['a@b.co'] }, 'invalid_email'],
      ['POST', '/auth/email/verify', { email: 'a@b.co', code: '12345' }, 'invalid_code'],
      ['POST', '/auth/refresh', {}, 'invalid_refresh_token'],
      ['POST', '/auth/logout', { refreshToken: { $ne: null } }, 'invalid_refresh_token'],
      ['POST', '/sync/push', { table: 'users', rows: [] }, 'unknown_table', tok],
      ['POST', '/sync/push', { table: 'cards', rows: 'x' }, 'rows_must_be_array', tok],
      ['POST', '/ai/plan/week', { profile: [] }, 'profile_required', tok],
      ['POST', '/ai/plan/week', { profile: {}, params: { deload: 'yes' } }, 'invalid_deload', tok],
      ['POST', '/ai/plan/week', { profile: {}, params: { weekStart: '23/11/2026' } }, 'invalid_week_start', tok],
      ['POST', '/ai/swap', { profile: {}, params: { item: 'exercise', index: -1 } }, 'invalid_index', tok],
      ['POST', '/ai/swap', { profile: {}, params: { item: 'exercise', currentId: '$where' } }, 'invalid_current_id', tok],
    ];
    for (const [m, p, body, code, extra] of cases) {
      const r = await call(t, m, p, { body, ...(extra ?? {}) });
      expect(r.status, `${p} ${JSON.stringify(body).slice(0, 60)}`).toBe(400);
      expect(r.body, p).toEqual({ error: code });
    }
    for (const q of ['since=abc', 'since=-1', 'limit=0', 'limit=9999', 'cursor=%24%24', 'tables=users']) {
      const r = await call(t, 'GET', `/sync/pull?${q}`, tok);
      expect(r.status, q).toBe(400);
      expect(r.body.error, q).toMatch(/^[a-z_]+$/);
    }
  });

  it('operator-shaped values never reach the database (NoSQL injection)', async () => {
    const t = await setup();
    for (const body of [{ email: { $gt: '' } }, { email: 'a@b.co', code: { $ne: '0' } }]) {
      const path = 'code' in body ? '/auth/email/verify' : '/auth/email/start';
      expect((await call(t, 'POST', path, { body })).status).toBe(400);
    }
  });

  it('unknown AI params are dropped, known ones are range-checked', async () => {
    const t = await setup();
    const s = await signInEmail(t, 'p@example.com');
    const r = await call(t, 'POST', '/ai/plan/week', {
      token: s.accessToken,
      body: { profile: {}, params: { weekStart: '2026-11-23', trainingWeekdays: [0, 2, 4], deload: true, junk: { deep: 1 } } },
    });
    expect(r.status).toBe(200); // stub planner: rules contract
    expect((await call(t, 'POST', '/ai/plan/week', { token: s.accessToken, body: { profile: {}, params: { adjustmentKcal: 5000 } } })).body).toEqual({
      error: 'invalid_adjustment_kcal',
    });
  });
});

describe('JWT algorithm pinning', () => {
  const claims = { typ: 'access', anon: false };
  it('access tokens: only HS256 with our secret, issuer and audience', async () => {
    const t = await setup();
    const s = await signInEmail(t, 'jwt@example.com');
    const key = new TextEncoder().encode(SECRET);
    const sign = (alg: string, k: unknown = key) =>
      new SignJWT(claims).setProtectedHeader({ alg }).setSubject(s.user.id).setIssuer('repwise-api').setAudience('repwise-app').setIssuedAt().setExpirationTime('10m').sign(k as Uint8Array);
    const rsa = await generateKeyPair('RS256');
    const bad = [
      await sign('HS512'), // same secret, other HMAC
      await sign('HS384'),
      await sign('RS256', rsa.privateKey), // asymmetric confusion
      await new SignJWT({ typ: 'refresh' }).setProtectedHeader({ alg: 'HS256' }).setSubject(s.user.id).setIssuer('repwise-api').setAudience('repwise-app').setIssuedAt().setExpirationTime('10m').sign(key),
      await new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setSubject(s.user.id).setIssuer('evil').setAudience('repwise-app').setIssuedAt().setExpirationTime('10m').sign(key),
    ];
    for (const tok of bad) expect((await call(t, 'GET', '/sync/pull', { token: tok })).status).toBe(401);
    expect((await call(t, 'GET', '/sync/pull', { token: await sign('HS256') })).status).toBe(200);
  });

  it('Google ID tokens: RS256 only (an HS256 token keyed with the public client id is rejected)', async () => {
    const t = await setup();
    const hs = await new SignJWT({ sub: 'g1', email: 'x@y.co', email_verified: true })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('https://accounts.google.com')
      .setAudience(GOOGLE_AUD)
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(new TextEncoder().encode(GOOGLE_AUD.padEnd(32, 'x')));
    expect((await call(t, 'POST', '/auth/google', { body: { idToken: hs } })).status).toBe(401);
    expect((await call(t, 'POST', '/auth/google', { body: { idToken: await t.google.sign({ sub: 'g1' }) } })).status).toBe(200);
  });

  it('Apple identity tokens: RS256 only', async () => {
    const t = await setup();
    const ec = await generateKeyPair('ES256');
    const es = await new SignJWT({ sub: 'a1', nonce: 'n' })
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .setIssuer('https://appleid.apple.com')
      .setAudience('com.client.repwise')
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(ec.privateKey);
    expect((await call(t, 'POST', '/auth/apple', { body: { identityToken: es, nonce: 'raw-nonce-123' } })).status).toBe(401);
  });
});

describe('CORS, headers and request ids', () => {
  it('production allows no browser origin unless CORS_ORIGINS is set; credentials never', async () => {
    const t = await setup({ env: { ENVIRONMENT: 'production' } });
    const pre = await call(t, 'OPTIONS', '/auth/refresh', { headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } });
    expect(pre.headers.get('access-control-allow-origin')).toBeNull();
    const get = await call(t, 'GET', '/health', { headers: { origin: 'https://evil.example' } });
    expect(get.headers.get('access-control-allow-origin')).toBeNull();
    const t2 = await setup({ env: { ENVIRONMENT: 'production', CORS_ORIGINS: 'https://repwise.app' } });
    const ok = await call(t2, 'GET', '/health', { headers: { origin: 'https://repwise.app' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://repwise.app');
    expect(ok.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('every response carries a request id (a well-formed client id is kept) and HSTS', async () => {
    const t = await setup();
    const a = await call(t, 'GET', '/health');
    expect(a.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.headers.get('strict-transport-security')).toContain('max-age=');
    expect((await call(t, 'GET', '/nope', { headers: { 'x-request-id': 'client-req-12345' } })).headers.get('x-request-id')).toBe('client-req-12345');
    expect((await call(t, 'GET', '/health', { headers: { 'x-request-id': 'bad id {}' } })).headers.get('x-request-id')).not.toContain('bad');
    const line = t.log.lines.map((l) => JSON.parse(l.line)).find((l) => l.reqId === 'client-req-12345');
    expect(line).toMatchObject({ msg: 'request', method: 'GET', status: 404 });
  });

  it('/health is liveness only: no config, versions, env or secrets', async () => {
    const t = await setup({ env: { ANTHROPIC_API_KEY: 'sk-ant-secret', MONGODB_URI: 'mongodb+srv://u:p@x' } });
    const r = await call(t, 'GET', '/health');
    expect(Object.keys(r.body).sort()).toEqual(['ok', 'service', 'time']);
    expect(r.text).not.toMatch(/sk-ant|mongodb|anthropic|haiku|test/);
  });
});

describe('rate limits and authz', () => {
  it('/ai/usage: user tokens are refused and guessing the admin token is rate limited', async () => {
    const t = await setup({ env: { AI_ADMIN_TOKEN: 'admin-token-0123456789' } });
    const s = await signInEmail(t, 'nosy@example.com');
    expect((await call(t, 'GET', '/ai/usage', { token: s.accessToken })).status).toBe(401);
    const st: number[] = [];
    for (let i = 0; i < 11; i++) st.push((await call(t, 'GET', '/ai/usage', { token: `guess-${i}` })).status);
    expect(st.slice(0, 9).every((x) => x === 401)).toBe(true);
    expect(st[10]).toBe(429);
    expect((await call(t, 'GET', '/ai/usage?month=2026-13', { token: 'admin-token-0123456789' })).status).toBe(429); // same IP, still limited
  });

  it('webhooks are rate limited per IP before any signature work', async () => {
    const t = await setup({ env: { PAYMENTS_ENABLED: 'true' } });
    let last = 0;
    for (let i = 0; i < 301; i++) last = (await call(t, 'POST', '/webhooks/play', { body: {}, headers: { 'cf-connecting-ip': '203.0.113.9' } })).status;
    expect(last).toBe(429);
    expect((await call(t, 'POST', '/webhooks/play', { body: {}, headers: { 'cf-connecting-ip': '203.0.113.10' } })).status).toBe(401);
  });

  it("one user's AI cache, entitlement and rows are never visible to another", async () => {
    const t = await setup();
    const a = await signInEmail(t, 'a@example.com');
    const b = await signInEmail(t, 'b@example.com');
    await t.db.putAiCache({ _id: 'x', userId: a.user.id, kind: 'plan_week', response: { secret: 'a-only' }, createdAt: 0, expiresAt: Number.MAX_SAFE_INTEGER });
    const r = await call(t, 'POST', '/ai/plan/week', { token: b.accessToken, body: { profile: {} } });
    expect(r.text).not.toContain('a-only');
    await call(t, 'POST', '/sync/push', { token: a.accessToken, body: { table: 'cards', rows: [{ id: 'c1', created_at: 1, updated_at: 1, deleted_at: null }] } });
    const pulled = await call(t, 'GET', '/sync/pull', { token: b.accessToken });
    expect(JSON.stringify(pulled.body.changes)).not.toContain('c1');
  });
});

describe('webhook payloads', () => {
  it('Apple: malformed envelopes are 400; a verified payload with a bad shape is 400', async () => {
    const store = {
      verifyNotification: async () => ({ notificationType: 42 }),
      verifyTransaction: async () => {
        throw new Error('unused');
      },
    } as unknown as AppleStore;
    const t = await setup({ env: { PAYMENTS_ENABLED: 'true' }, appleStore: store });
    expect((await call(t, 'POST', '/webhooks/apple', { body: {} })).body).toEqual({ error: 'invalid_signed_payload' });
    expect((await call(t, 'POST', '/webhooks/apple', { body: { signedPayload: 'not a jws at all' } })).status).toBe(400);
    const r = await call(t, 'POST', '/webhooks/apple', { body: { signedPayload: 'eyJhbGciOiJFUzI1NiJ9.eyJhIjoxfQ.c2lnbmF0dXJl' } });
    expect(r.status).toBe(400);
  });

  it('Play: authenticated pushes still need a well-formed RTDN', async () => {
    const t = await setup({ env: { PAYMENTS_ENABLED: 'true', PLAY_RTDN_SECRET: 'rtdn-secret-1234567890' } });
    t.deps.verifyPubsub = pubsubVerifier(t.deps.config);
    const push = (data: string) => call(t, 'POST', '/webhooks/play?token=rtdn-secret-1234567890', { body: { message: { data, messageId: '1' } } });
    const enc = (v: unknown) => b64Encode(new TextEncoder().encode(JSON.stringify(v)));
    expect((await push('!!!')).status).toBe(400);
    expect((await push(b64Encode(new TextEncoder().encode('not json')))).status).toBe(400);
    expect((await push(enc({ subscriptionNotification: { purchaseToken: 't' } }))).status).toBe(400); // no packageName
    expect((await push(enc({ packageName: 'com.client.repwise', subscriptionNotification: { purchaseToken: 42 } }))).status).toBe(400);
    expect((await push(enc({ packageName: 'com.other.app', testNotification: {} }))).body).toEqual({ ok: true, ignored: true });
  });
});

describe('no secrets in logs', () => {
  it('redacts credential keys and credential-looking values anywhere', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.c2lnbmF0dXJlc2lnbmF0dXJl';
    const out = JSON.stringify(
      redact({
        authorization: 'Bearer abc',
        refreshToken: 'rt_abc',
        nested: { apiKey: 'k', note: `token ${jwt} and sk-ant-api03-abcdef and mongodb+srv://u:p@h/db` },
        url: '/webhooks/play?token=rtdn-secret&x=1',
        who: 'someone@example.com',
        inputTokens: 12,
        err: new Error(`failed for ${jwt}`),
      }),
    );
    for (const s of [jwt, 'Bearer abc', 'rt_abc', 'sk-ant-api03', 'mongodb+srv', 'rtdn-secret', 'someone@example.com']) expect(out).not.toContain(s);
    expect(out).toContain('"inputTokens":12');
    expect(redactString('/x?code=123456&ok=1')).toBe('/x?code=[redacted]&ok=1');
  });

  it('a full sign-in, refresh, webhook and failure flow logs no secret or email', async () => {
    const t = await setup({ env: { PAYMENTS_ENABLED: 'true', PLAY_RTDN_SECRET: 'rtdn-secret-1234567890', ANTHROPIC_API_KEY: 'sk-ant-live-key' } });
    t.deps.verifyPubsub = pubsubVerifier(t.deps.config);
    const s = await signInEmail(t, 'private.person@example.com');
    const g = await t.google.sign({ sub: 'g-77', email: 'private.person@example.com', email_verified: true });
    await call(t, 'POST', '/auth/google', { body: { idToken: g } });
    await call(t, 'POST', '/auth/refresh', { body: { refreshToken: s.refreshToken } });
    await call(t, 'POST', '/auth/refresh', { body: { refreshToken: s.refreshToken } });
    await call(t, 'POST', '/webhooks/play?token=rtdn-secret-1234567890', { body: { message: { data: '!!!' } } });
    t.deps.db = () => Promise.reject(new Error(`connect failed mongodb+srv://user:pw@cluster/x token=${s.accessToken}`));
    expect((await call(t, 'GET', '/sync/pull', { token: s.accessToken })).status).toBe(500);
    const text = t.log.lines.map((l) => l.line).join('\n');
    expect(text.length).toBeGreaterThan(0);
    for (const secret of [s.accessToken, s.refreshToken, g, 'rtdn-secret-1234567890', 'sk-ant-live-key', 'private.person', 'pw@cluster', SECRET]) {
      expect(text, secret.slice(0, 12)).not.toContain(secret);
    }
    expect(text).toContain('"msg":"unhandled"');
  });
});
