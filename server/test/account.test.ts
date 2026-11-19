import { describe, expect, it } from 'vitest';
import { call, row, setup, signInEmail } from './helpers';

describe('DELETE /account', () => {
  it('removes all of the user’s data and nothing else, idempotently', async () => {
    const t = await setup();
    const a = await signInEmail(t, 'del@example.com');
    const b = await signInEmail(t, 'keep@example.com');
    for (const tok of [a.accessToken, b.accessToken]) {
      await call(t, 'POST', '/sync/push', { token: tok, body: { table: 'profile', rows: [row('prof', 1, { goal: 'gain' })] } });
      await call(t, 'POST', '/sync/push', { token: tok, body: { table: 'sessions', rows: [row('s1', 1, { status: 'done' })] } });
    }
    for (const [uid, id] of [[a.user.id, 'A'], [b.user.id, 'B']] as const) {
      await t.db.putPurchase({ _id: `play:${id}`, userId: uid, source: 'play', purchaseToken: id, productId: 'repwise_pro', plan: 'monthly', state: 'active', expiresAt: t.clock.now + 1e9, inTrial: false, autoRenew: true, lastEventAt: 0, raw: {}, updatedAt: 0 });
      await t.db.putEntitlement({ _id: uid, pro: true, source: 'play', plan: 'monthly', expiresAt: t.clock.now + 1e9, inTrial: false, autoRenew: true, updatedAt: 0 });
      await t.db.putAiCache({ _id: `${uid}:swap:h`, userId: uid, kind: 'swap', response: {}, createdAt: 0, expiresAt: t.clock.now + 1e6 });
    }
    await call(t, 'POST', '/auth/email/start', { body: { email: 'del@example.com' } });

    const del = await call(t, 'DELETE', '/account', { token: a.accessToken });
    expect(del.status).toBe(204);

    const dump = JSON.stringify({
      users: [...t.db.users.values()],
      rt: [...t.db.refreshTokens.values()],
      codes: [...t.db.emailCodes.values()],
      tables: [...t.db.tables.values()].map((m) => [...m.values()]),
      purchases: [...t.db.purchases.values()],
      ent: [...t.db.entitlements.values()],
      ai: [...t.db.aiCache.values()],
    });
    expect(dump).not.toContain(a.user.id);
    expect(dump).not.toContain('del@example.com');
    expect(dump).toContain(b.user.id);
    expect(t.db.tables.get('sessions')!.size).toBe(1);

    // Idempotent with the same (still unexpired) token, but nothing else works with it.
    expect((await call(t, 'DELETE', '/account', { token: a.accessToken })).status).toBe(204);
    expect((await call(t, 'GET', '/sync/pull', { token: a.accessToken })).status).toBe(401);
    expect((await call(t, 'GET', '/sync/pull', { token: b.accessToken })).status).toBe(200);
  });

  it('needs a valid token', async () => {
    const t = await setup();
    expect((await call(t, 'DELETE', '/account')).status).toBe(401);
    expect((await call(t, 'DELETE', '/account', { token: 'junk' })).status).toBe(401);
  });
});
