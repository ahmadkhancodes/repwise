import { describe, expect, it } from 'vitest';
import { verifyAccessToken } from '../src/auth/jwt';
import { GOOGLE_AUD, call, row, setup, signInEmail } from './helpers';

describe('anonymous accounts', () => {
  it('creates a silent account with tokens', async () => {
    const t = await setup();
    const r = await call(t, 'POST', '/auth/anonymous', { body: { deviceId: 'dev-1' } });
    expect(r.status).toBe(201);
    expect(r.body.user.anonymous).toBe(true);
    expect(r.body.expiresIn).toBe(900);
    const claims = await verifyAccessToken(t.deps.config, r.body.accessToken, t.clock.now);
    expect(claims?.sub).toBe(r.body.user.id);
    expect(claims?.anon).toBe(true);
  });

  it('is rate limited per IP', async () => {
    const t = await setup();
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await call(t, 'POST', '/auth/anonymous', { body: {}, headers: { 'cf-connecting-ip': '1.2.3.4' } })).status);
    expect(codes.slice(0, 10).every((c) => c === 201)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});

describe('POST /auth/google', () => {
  it('signs in with a valid ID token and reuses the account next time', async () => {
    const t = await setup();
    const idToken = await t.google.sign({ sub: 'g-1', email: 'Ann@Example.com', email_verified: true });
    const a = await call(t, 'POST', '/auth/google', { body: { idToken } });
    expect(a.status).toBe(200);
    expect(a.body.user.email).toBe('ann@example.com');
    const b = await call(t, 'POST', '/auth/google', { body: { idToken: await t.google.sign({ sub: 'g-1' }) } });
    expect(b.body.user.id).toBe(a.body.user.id);
  });

  it('rejects wrong audience, issuer, expiry and signature', async () => {
    const t = await setup();
    const bad = [
      await t.google.sign({ sub: 'g' }, { aud: 'someone-else' }),
      await t.google.sign({ sub: 'g' }, { iss: 'https://evil.example' }),
      await t.google.sign({ sub: 'g' }, { exp: Math.floor(Date.now() / 1000) - 3600 }),
      await t.apple.sign({ sub: 'g' }, { iss: 'https://accounts.google.com', aud: GOOGLE_AUD }), // wrong key
      'not-a-jwt',
    ];
    for (const idToken of bad) expect((await call(t, 'POST', '/auth/google', { body: { idToken } })).status).toBe(401);
    expect((await call(t, 'POST', '/auth/google', { body: {} })).status).toBe(400);
  });

  it('links to an existing email account only when the email is verified', async () => {
    const t = await setup();
    const mail = await signInEmail(t, 'bo@example.com');
    const unverified = await call(t, 'POST', '/auth/google', { body: { idToken: await t.google.sign({ sub: 'g-2', email: 'bo@example.com', email_verified: false }) } });
    expect(unverified.body.user.id).not.toBe(mail.user.id);
    const verified = await call(t, 'POST', '/auth/google', { body: { idToken: await t.google.sign({ sub: 'g-3', email: 'bo@example.com', email_verified: true }) } });
    expect(verified.body.user.id).toBe(mail.user.id);
  });
});

describe('POST /auth/apple', () => {
  it('verifies the identity token and requires the sha256 nonce', async () => {
    const t = await setup();
    const raw = 'nonce-123';
    const hashed = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const ok1 = await call(t, 'POST', '/auth/apple', { body: { identityToken: await t.apple.sign({ sub: 'a-1', nonce: hashed, email: 'x@privaterelay.appleid.com', email_verified: 'true' }), nonce: raw } });
    expect(ok1.status).toBe(200);
    expect(ok1.body.user.email).toBe('x@privaterelay.appleid.com');
    const again = await call(t, 'POST', '/auth/apple', { body: { identityToken: await t.apple.sign({ sub: 'a-1', nonce: hashed }), nonce: raw } });
    expect(again.body.user.id).toBe(ok1.body.user.id);
    const bad = await call(t, 'POST', '/auth/apple', { body: { identityToken: await t.apple.sign({ sub: 'a-1', nonce: 'other' }), nonce: raw } });
    expect(bad.status).toBe(401);
    const wrongAud = await call(t, 'POST', '/auth/apple', { body: { identityToken: await t.apple.sign({ sub: 'a-1', nonce: hashed }, { aud: 'com.other.app' }), nonce: raw } });
    expect(wrongAud.status).toBe(401);
  });

  it('rejects replays: a missing nonce, or the token\'s own (hashed) nonce claim sent back as raw', async () => {
    const t = await setup();
    const raw = 'nonce-replay-0123456789';
    const hashed = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const token = await t.apple.sign({ sub: 'a-9', nonce: hashed });
    expect((await call(t, 'POST', '/auth/apple', { body: { identityToken: token } })).status).toBe(400);
    expect((await call(t, 'POST', '/auth/apple', { body: { identityToken: token, nonce: hashed } })).status).toBe(401);
    // A raw nonce sitting in the token (never what Apple issues for our client) does not verify either.
    const rawInToken = await t.apple.sign({ sub: 'a-9', nonce: raw });
    expect((await call(t, 'POST', '/auth/apple', { body: { identityToken: rawInToken, nonce: raw } })).status).toBe(401);
    expect((await call(t, 'POST', '/auth/apple', { body: { identityToken: token, nonce: raw } })).status).toBe(200);
  });
});

describe('email code sign-in', () => {
  it('sends a 6-digit code and verifies it once', async () => {
    const t = await setup();
    const r = await signInEmail(t, 'Cy@Example.com');
    expect(r.user.email).toBe('cy@example.com');
    expect(t.mailer.sent[0]!.to).toBe('cy@example.com');
    const code = /(\d{6})/.exec(t.mailer.sent[0]!.subject)![1];
    expect((await call(t, 'POST', '/auth/email/verify', { body: { email: 'cy@example.com', code } })).status).toBe(401);
  });

  it('stores only a hash of the code', async () => {
    const t = await setup();
    await call(t, 'POST', '/auth/email/start', { body: { email: 'h@example.com' } });
    const code = /(\d{6})/.exec(t.mailer.sent[0]!.subject)![1]!;
    expect(JSON.stringify([...t.db.emailCodes.values()])).not.toContain(code);
  });

  it('locks the code after 5 wrong attempts', async () => {
    const t = await setup();
    await call(t, 'POST', '/auth/email/start', { body: { email: 'd@example.com' } });
    const code = /(\d{6})/.exec(t.mailer.sent[0]!.subject)![1]!;
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect((await call(t, 'POST', '/auth/email/verify', { body: { email: 'd@example.com', code: wrong } })).status).toBe(401);
    expect((await call(t, 'POST', '/auth/email/verify', { body: { email: 'd@example.com', code } })).status).toBe(429);
  });

  it('parallel guesses cannot bypass the 5-attempt lock (check-and-count is atomic)', async () => {
    const t = await setup();
    await call(t, 'POST', '/auth/email/start', { body: { email: 'race@example.com' } });
    const code = /(\d{6})/.exec(t.mailer.sent[0]!.subject)![1]!;
    const wrong = (i: number) => String((Number(code) + 1 + i) % 1_000_000).padStart(6, '0');
    // 11 requests at once, from 11 IPs; the right code is the last one.
    const guesses = [...Array.from({ length: 10 }, (_, i) => wrong(i)), code];
    const res = await Promise.all(
      guesses.map((g, i) =>
        call(t, 'POST', '/auth/email/verify', { body: { email: 'race@example.com', code: g }, headers: { 'cf-connecting-ip': `10.0.0.${i}` } }),
      ),
    );
    const statuses = res.map((r) => r.status);
    expect(statuses.at(-1)).not.toBe(200);
    expect(statuses.filter((s) => s === 200)).toHaveLength(0);
    expect(statuses).toContain(429); // used up and locked
  });

  it('limits verification attempts per email across IPs', async () => {
    const t = await setup();
    const statuses: number[] = [];
    for (let round = 0; round < 4; round++) {
      await t.db.putEmailCode({ _id: `c${round}`, email: 'spread@example.com', codeHash: 'x', attempts: 0, createdAt: t.clock.now, expiresAt: t.clock.now + 600_000 });
      for (let i = 0; i < 5; i++) {
        const ip = `10.1.${round}.${i}`;
        statuses.push((await call(t, 'POST', '/auth/email/verify', { body: { email: 'spread@example.com', code: '123456' }, headers: { 'cf-connecting-ip': ip } })).status);
      }
    }
    // 15 counted attempts per 15 minutes per email, whatever the IP; then 429 before any compare.
    expect(statuses.slice(0, 15).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(15).every((s) => s === 429)).toBe(true);
  });

  it('expires codes after 10 minutes', async () => {
    const t = await setup();
    await call(t, 'POST', '/auth/email/start', { body: { email: 'e@example.com' } });
    const code = /(\d{6})/.exec(t.mailer.sent[0]!.subject)![1]!;
    t.clock.now += 11 * 60_000;
    expect((await call(t, 'POST', '/auth/email/verify', { body: { email: 'e@example.com', code } })).status).toBe(401);
  });

  it('limits sends to 3 per 15 minutes per email and validates input', async () => {
    const t = await setup();
    const s = [];
    for (let i = 0; i < 4; i++) s.push((await call(t, 'POST', '/auth/email/start', { body: { email: 'f@example.com' } })).status);
    expect(s).toEqual([200, 200, 200, 429]);
    expect((await call(t, 'POST', '/auth/email/start', { body: { email: 'not-an-email' } })).status).toBe(400);
    expect((await call(t, 'POST', '/auth/email/verify', { body: { email: 'f@example.com', code: 'abc' } })).status).toBe(400);
  });
});

describe('refresh tokens', () => {
  it('rotates on every refresh and stores only hashes', async () => {
    const t = await setup();
    const s = await signInEmail(t, 'r@example.com');
    expect(JSON.stringify([...t.db.refreshTokens.values()])).not.toContain(s.refreshToken);
    const r1 = await call(t, 'POST', '/auth/refresh', { body: { refreshToken: s.refreshToken } });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(s.refreshToken);
    const r2 = await call(t, 'POST', '/auth/refresh', { body: { refreshToken: r1.body.refreshToken } });
    expect(r2.status).toBe(200);
  });

  it('detects reuse of a rotated token and revokes the whole family', async () => {
    const t = await setup();
    const s = await signInEmail(t, 'reuse@example.com');
    const r1 = await call(t, 'POST', '/auth/refresh', { body: { refreshToken: s.refreshToken } });
    t.clock.now += 61_000; // past the lost-response grace window
    const replay = await call(t, 'POST', '/auth/refresh', { body: { refreshToken: s.refreshToken } });
    expect(replay.status).toBe(401);
    expect(replay.body.error).toBe('token_reused');
    expect((await call(t, 'POST', '/auth/refresh', { body: { refreshToken: r1.body.refreshToken } })).status).toBe(401);
  });

  it('a retry within the grace window (lost response) gets the same successor, not a revoked family', async () => {
    const t = await setup();
    const s = await signInEmail(t, 'lost@example.com');
    const r1 = await call(t, 'POST', '/auth/refresh', { body: { refreshToken: s.refreshToken } });
    expect(r1.status).toBe(200);
    // r1's response never reached the phone; it retries with the old token 20 s later.
    t.clock.now += 20_000;
    const retry = await call(t, 'POST', '/auth/refresh', { body: { refreshToken: s.refreshToken } });
    expect(retry.status).toBe(200);
    expect(retry.body.refreshToken).toBe(r1.body.refreshToken);
    // The family is intact: the successor keeps rotating.
    const r2 = await call(t, 'POST', '/auth/refresh', { body: { refreshToken: retry.body.refreshToken } });
    expect(r2.status).toBe(200);
  });

  it('reuse after the grace window, or after the successor was used, still revokes the family', async () => {
    const t = await setup();
    const a = await signInEmail(t, 'late@example.com');
    const a1 = await call(t, 'POST', '/auth/refresh', { body: { refreshToken: a.refreshToken } });
    t.clock.now += 61_000;
    expect((await call(t, 'POST', '/auth/refresh', { body: { refreshToken: a.refreshToken } })).body.error).toBe('token_reused');
    expect((await call(t, 'POST', '/auth/refresh', { body: { refreshToken: a1.body.refreshToken } })).status).toBe(401);

    const b = await signInEmail(t, 'stolen@example.com');
    const b1 = await call(t, 'POST', '/auth/refresh', { body: { refreshToken: b.refreshToken } });
    const b2 = await call(t, 'POST', '/auth/refresh', { body: { refreshToken: b1.body.refreshToken } });
    expect(b2.status).toBe(200);
    t.clock.now += 5_000; // within the window, but the successor was already used: theft
    expect((await call(t, 'POST', '/auth/refresh', { body: { refreshToken: b.refreshToken } })).body.error).toBe('token_reused');
    expect((await call(t, 'POST', '/auth/refresh', { body: { refreshToken: b2.body.refreshToken } })).status).toBe(401);
  });

  it('rejects unknown, expired and logged-out tokens', async () => {
    const t = await setup();
    expect((await call(t, 'POST', '/auth/refresh', { body: { refreshToken: 'rt_nope' } })).status).toBe(401);
    const s = await signInEmail(t, 'lo@example.com');
    expect((await call(t, 'POST', '/auth/logout', { body: { refreshToken: s.refreshToken } })).status).toBe(204);
    expect((await call(t, 'POST', '/auth/refresh', { body: { refreshToken: s.refreshToken } })).status).toBe(401);
    const s2 = await signInEmail(t, 'old@example.com');
    t.clock.now += 61 * 24 * 3600 * 1000;
    expect((await call(t, 'POST', '/auth/refresh', { body: { refreshToken: s2.refreshToken } })).status).toBe(401);
  });
});

describe('anonymous → real account', () => {
  it('upgrades the anonymous account in place for a new identity', async () => {
    const t = await setup();
    const anon = await call(t, 'POST', '/auth/anonymous', { body: {} });
    const s = await signInEmail(t, 'new@example.com', { token: anon.body.accessToken });
    expect(s.user.id).toBe(anon.body.user.id);
    expect(s.user.anonymous).toBe(false);
  });

  it('merges purchases into an existing account and deletes the anonymous one', async () => {
    const t = await setup();
    const existing = await signInEmail(t, 'old@example.com');
    const anon = await call(t, 'POST', '/auth/anonymous', { body: {} });
    await t.db.putPurchase({
      _id: 'apple:1', userId: anon.body.user.id, source: 'apple', originalTransactionId: '1', productId: 'com.client.repwise.pro.yearly',
      plan: 'yearly', state: 'active', expiresAt: t.clock.now + 1e9, inTrial: true, autoRenew: true, lastEventAt: t.clock.now, raw: null, updatedAt: t.clock.now,
    });
    const s = await signInEmail(t, 'old@example.com', { token: anon.body.accessToken });
    expect(s.user.id).toBe(existing.user.id);
    expect(await t.db.getUser(anon.body.user.id)).toBeNull();
    expect((await t.db.getPurchase('apple:1'))?.userId).toBe(existing.user.id);
    expect((await t.db.getEntitlement(existing.user.id))?.pro).toBe(true);
    expect((await call(t, 'GET', '/sync/pull', { token: anon.body.accessToken })).status).toBe(401);
  });
});

describe('deleted users', () => {
  it('cannot use an access token issued before deletion', async () => {
    const t = await setup();
    const s = await signInEmail(t, 'gone@example.com');
    expect((await call(t, 'POST', '/sync/push', { token: s.accessToken, body: { table: 'cards', rows: [row('c1', t.clock.now)] } })).status).toBe(200);
    expect((await call(t, 'DELETE', '/account', { token: s.accessToken })).status).toBe(204);
    const push = await call(t, 'POST', '/sync/push', { token: s.accessToken, body: { table: 'cards', rows: [row('c2', t.clock.now)] } });
    expect(push.status).toBe(401);
    expect((await call(t, 'GET', '/sync/pull', { token: s.accessToken })).status).toBe(401);
    expect((await call(t, 'POST', '/ai/swap', { token: s.accessToken, body: { profile: {}, params: {} } })).status).toBe(401);
    expect((await call(t, 'POST', '/auth/refresh', { body: { refreshToken: s.refreshToken } })).status).toBe(401);
    expect(t.db.tables.get('cards')?.size ?? 0).toBe(0);
  });
});
