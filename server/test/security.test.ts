import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { MemoryDb } from '../src/db/memory';
import { call, setup, signInEmail } from './helpers';

const PROTECTED: [string, string][] = [
  ['GET', '/sync/pull'],
  ['POST', '/sync/push'],
  ['DELETE', '/account'],
  ['POST', '/ai/plan/week'],
  ['POST', '/ai/meals/day'],
  ['POST', '/ai/swap'],
];

describe('security baseline', () => {
  it('sets nosniff and no-store on every response, including errors and 404s', async () => {
    const t = await setup();
    for (const [m, p] of [['GET', '/health'], ['GET', '/nope'], ['GET', '/sync/pull']] as const) {
      const r = await call(t, m, p);
      expect(r.headers.get('x-content-type-options')).toBe('nosniff');
      expect(r.headers.get('content-type')).toContain('application/json');
    }
    expect((await call(t, 'GET', '/sync/pull')).headers.get('cache-control')).toBe('no-store');
  });

  it('CORS allows any origin without credentials', async () => {
    const t = await setup();
    const pre = await call(t, 'OPTIONS', '/auth/refresh', {
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' },
    });
    expect(pre.status).toBeLessThan(300);
    expect(pre.headers.get('access-control-allow-origin')).toBe('*');
    expect(pre.headers.get('access-control-allow-credentials')).toBeNull();
    const get = await call(t, 'GET', '/health', { headers: { origin: 'https://x.example' } });
    expect(get.headers.get('access-control-allow-origin')).toBe('*');
    expect(get.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('CORS restricts origins when CORS_ORIGINS is set', async () => {
    const t = await setup({ env: { CORS_ORIGINS: 'https://repwise.app' } });
    const ok = await call(t, 'GET', '/health', { headers: { origin: 'https://repwise.app' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://repwise.app');
    const bad = await call(t, 'GET', '/health', { headers: { origin: 'https://evil.example' } });
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('returns 413 for oversized bodies (declared length and streamed)', async () => {
    const t = await setup();
    const big = JSON.stringify({ email: 'a'.repeat(10_000) + '@x.io' });
    const r1 = await call(t, 'POST', '/auth/email/start', { raw: big, headers: { 'content-type': 'application/json', 'content-length': String(big.length) } });
    expect(r1.status).toBe(413);
    const stream = new ReadableStream({
      start(ctrl) {
        for (let i = 0; i < 20; i++) ctrl.enqueue(new TextEncoder().encode('x'.repeat(1024)));
        ctrl.close();
      },
    });
    const res = await t.app.request('/auth/email/start', { method: 'POST', body: stream, duplex: 'half' } as RequestInit, t.env);
    expect(res.status).toBe(413);
  });

  it('returns 400 for malformed JSON and non-object JSON', async () => {
    const t = await setup();
    expect((await call(t, 'POST', '/auth/email/start', { raw: '{"email":', headers: { 'content-type': 'application/json' } })).status).toBe(400);
    const r = await call(t, 'POST', '/auth/email/start', { raw: '[1,2]' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('expected_object');
  });

  it('unknown routes are JSON 404s', async () => {
    const t = await setup();
    const r = await call(t, 'GET', '/admin');
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'not_found' });
  });

  it('never leaks stack traces or secrets on internal errors', async () => {
    const db = new MemoryDb();
    db.getUser = async () => {
      throw new Error('connect failed mongodb+srv://admin:hunter2@cluster0.example.net');
    };
    const t = await setup({ db });
    const { accessToken } = await (async () => {
      const ok = await setup();
      return signInEmail(ok, 'a@b.co');
    })();
    const r = await call(t, 'GET', '/sync/pull', { token: accessToken });
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ error: 'internal' });
    expect(r.text).not.toMatch(/hunter2|mongodb|stack|at /);
  });

  it('garbage, forged, alg=none and expired tokens get 401, never 500', async () => {
    const t = await setup();
    const forged = await new SignJWT({ typ: 'access', anon: false })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u1')
      .setIssuer('repwise-api')
      .setAudience('repwise-app')
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(new TextEncoder().encode('another-secret-another-secret-another-secret'));
    const none = `${btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))}.${btoa(JSON.stringify({ sub: 'u1', typ: 'access' }))}.`;
    const tokens = ['garbage', 'a.b.c', forged, none, 'x'.repeat(5000), '%%%'];
    for (const [m, p] of PROTECTED) {
      for (const tok of tokens) {
        const r = await call(t, m, p, { token: tok, body: {} });
        expect(r.status, `${m} ${p} ${tok.slice(0, 10)}`).toBe(401);
      }
      expect((await call(t, m, p, { body: {} })).status).toBe(401);
      expect((await call(t, m, p, { headers: { authorization: 'Basic abc' }, body: {} })).status).toBe(401);
    }
    const { accessToken } = await signInEmail(t, 'exp@b.co');
    t.clock.now += 16 * 60_000;
    expect((await call(t, 'GET', '/sync/pull', { token: accessToken })).status).toBe(401);
  });

  it('refuses to sign or accept tokens when JWT_SECRET is missing or short (503, fail closed)', async () => {
    const t = await setup({ env: { JWT_SECRET: 'short' } });
    expect((await call(t, 'POST', '/auth/anonymous', { body: {} })).status).toBe(503);
    expect((await call(t, 'GET', '/sync/pull', { token: 'whatever' })).status).toBe(503);
  });

  it('health and config need no database and expose no secrets', async () => {
    const t = await setup({ env: { ANTHROPIC_API_KEY: 'sk-ant-secret', AI_ADMIN_TOKEN: 'admin-token-123456789' } });
    t.deps.db = () => Promise.reject(new Error('db down'));
    expect((await call(t, 'GET', '/health')).body.ok).toBe(true);
    const cfg = await call(t, 'GET', '/config');
    expect(cfg.status).toBe(200);
    expect(cfg.body.payments_enabled).toBe(false);
    expect(cfg.body.ai_provider).toBe('none');
    expect(cfg.text).not.toMatch(/sk-ant|admin-token|test-secret/);
  });
});
