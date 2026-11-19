import { describe, expect, it } from 'vitest';
import { MemoryDb } from '../src/db/memory';
import type { SyncRow } from '../src/db/types';
import { call, row, setup, signInEmail } from './helpers';

/** A store whose bulk write takes as long as the test says (an M0 write under load). */
class SlowDb extends MemoryDb {
  gate: Promise<void> | null = null;
  override async upsertRows(table: string, userId: string, rows: SyncRow[], syncedAt: number) {
    if (this.gate) await this.gate;
    return super.upsertRows(table, userId, rows, syncedAt);
  }
}

describe('sync push/pull', () => {
  it('round-trips rows, always under the token user', async () => {
    const t = await setup();
    const a = await signInEmail(t, 'a@example.com');
    const push = await call(t, 'POST', '/sync/push', {
      token: a.accessToken,
      body: { table: 'body_metrics', rows: [row('m1', t.clock.now, { date: '2026-11-19', weight_kg: 81.5, user_id: 'someone-else', dirty: 1 })] },
    });
    expect(push.status).toBe(200);
    expect(push.body).toMatchObject({ accepted: ['m1'], conflicts: [], rejected: [] });
    const pull = await call(t, 'GET', '/sync/pull?since=0', { token: a.accessToken });
    expect(pull.status).toBe(200);
    expect(pull.body.changes.body_metrics).toEqual([
      { id: 'm1', created_at: t.clock.now - 1000, updated_at: t.clock.now, deleted_at: null, date: '2026-11-19', weight_kg: 81.5, user_id: a.user.id },
    ]);
    expect(pull.body.nextCursor).toBeNull();
    expect(typeof pull.body.nextSince).toBe('number');
  });

  it('last write wins on updated_at; soft deletes sync', async () => {
    const t = await setup();
    const a = await signInEmail(t, 'lww@example.com');
    const p = (rows: unknown[]) => call(t, 'POST', '/sync/push', { token: a.accessToken, body: { table: 'meals', rows } });
    await p([row('x', 2000, { slot: 'lunch', status: 'planned' })]);
    const older = await p([row('x', 1000, { slot: 'lunch', status: 'eaten' })]);
    expect(older.body.conflicts).toEqual(['x']);
    const same = await p([row('x', 2000, { slot: 'lunch', status: 'eaten' })]);
    expect(same.body.conflicts).toEqual(['x']);
    const newer = await p([{ ...row('x', 3000, { slot: 'lunch', status: 'eaten' }), deleted_at: 3000 }]);
    expect(newer.body.accepted).toEqual(['x']);
    t.clock.now += 1;
    const pull = await call(t, 'GET', '/sync/pull?tables=meals', { token: a.accessToken });
    expect(pull.body.changes.meals[0]).toMatchObject({ id: 'x', status: 'eaten', deleted_at: 3000 });
  });

  it('pull only returns rows synced after `since`', async () => {
    const t = await setup();
    const a = await signInEmail(t, 's@example.com');
    await call(t, 'POST', '/sync/push', { token: a.accessToken, body: { table: 'cards', rows: [row('c1', 1)] } });
    t.clock.now += 10_000;
    const first = await call(t, 'GET', '/sync/pull', { token: a.accessToken });
    t.clock.now += 10_000;
    await call(t, 'POST', '/sync/push', { token: a.accessToken, body: { table: 'cards', rows: [row('c2', 2)] } });
    const next = await call(t, 'GET', `/sync/pull?since=${first.body.nextSince}`, { token: a.accessToken });
    expect(next.body.changes.cards.map((r: { id: string }) => r.id)).toEqual(['c2']);
  });

  it('a slow write that commits after a concurrent pull is never skipped by the next pull', async () => {
    const db = new SlowDb();
    const t = await setup({ db });
    const a = await signInEmail(t, 'slow@example.com');
    const push = (id: string) => call(t, 'POST', '/sync/push', { token: a.accessToken, body: { table: 'sets', rows: [row(id, t.clock.now)] } });
    expect((await push('s0')).status).toBe(200);
    const first = await call(t, 'GET', '/sync/pull', { token: a.accessToken });

    // Device A's push is stamped now but takes 3 s to commit…
    let release!: () => void;
    db.gate = new Promise<void>((r) => (release = r));
    const slow = push('s1');
    await new Promise((r) => setTimeout(r, 5));
    // …while device B pulls 2.5 s later and does not see it yet.
    t.clock.now += 2_500;
    const during = await call(t, 'GET', `/sync/pull?since=${first.body.nextSince}`, { token: a.accessToken });
    expect(during.body.changes.sets ?? []).toEqual([]);
    t.clock.now += 500;
    release();
    db.gate = null;
    expect((await slow).body.accepted).toEqual(['s1']);
    t.clock.now += 10_000;
    const after = await call(t, 'GET', `/sync/pull?since=${during.body.nextSince}`, { token: a.accessToken });
    expect((after.body.changes.sets ?? []).map((r: { id: string }) => r.id)).toContain('s1');
  });

  it('stamps are monotonic per user even when the clock steps back, and pulls are idempotent', async () => {
    const t = await setup();
    const a = await signInEmail(t, 'mono@example.com');
    await call(t, 'POST', '/sync/push', { token: a.accessToken, body: { table: 'cards', rows: [row('c1', 10)] } });
    const p1 = await call(t, 'GET', '/sync/pull', { token: a.accessToken });
    t.clock.now -= 60_000; // another Worker isolate with a slower clock
    await call(t, 'POST', '/sync/push', { token: a.accessToken, body: { table: 'cards', rows: [row('c2', 20)] } });
    const p2 = await call(t, 'GET', `/sync/pull?since=${p1.body.nextSince}`, { token: a.accessToken });
    expect(p2.body.changes.cards.map((r: { id: string }) => r.id)).toEqual(['c2']);
    expect(p2.body.nextSince).toBeGreaterThan(p1.body.nextSince);
    const again = await call(t, 'GET', `/sync/pull?since=${p1.body.nextSince}`, { token: a.accessToken });
    expect(again.body.changes).toEqual(p2.body.changes);
  });

  it('paginates across tables with an opaque cursor', async () => {
    const t = await setup();
    const a = await signInEmail(t, 'page@example.com');
    const ids = (p: string, n: number) => Array.from({ length: n }, (_, i) => row(`${p}${String(i).padStart(2, '0')}`, 100 + i));
    await call(t, 'POST', '/sync/push', { token: a.accessToken, body: { table: 'sets', rows: ids('s', 5) } });
    await call(t, 'POST', '/sync/push', { token: a.accessToken, body: { table: 'cards', rows: ids('c', 4) } });
    const seen: string[] = [];
    let url = '/sync/pull?limit=3';
    for (let i = 0; i < 10; i++) {
      const r = await call(t, 'GET', url, { token: a.accessToken });
      expect(r.status).toBe(200);
      for (const rows of Object.values(r.body.changes) as { id: string }[][]) seen.push(...rows.map((x) => x.id));
      if (!r.body.nextCursor) break;
      url = `/sync/pull?limit=3&cursor=${r.body.nextCursor}`;
    }
    expect(seen.sort()).toEqual(['c00', 'c01', 'c02', 'c03', 's00', 's01', 's02', 's03', 's04']);
    expect((await call(t, 'GET', '/sync/pull?cursor=garbage', { token: a.accessToken })).status).toBe(400);
  });

  it('validates rows: allow-listed fields, plain values, sizes, timestamps', async () => {
    const t = await setup();
    const a = await signInEmail(t, 'v@example.com');
    const r = await call(t, 'POST', '/sync/push', {
      token: a.accessToken,
      body: {
        table: 'food_logs',
        rows: [
          row('ok1', 1, { name: 'Oats', kcal: 300 }),
          row('bad1', 1, { $where: 'sleep(1000)' }),
          row('bad2', 1, { name: { $gt: '' } }),
          row('bad3', 1, { name: ['a'] }),
          row('bad4', t.clock.now + 3 * 24 * 3600 * 1000),
          { id: '../../etc', created_at: 1, updated_at: 1 },
          row('bad5', 1, { name: 'x'.repeat(300 * 1024) }),
          { id: 'bad6', created_at: 'yesterday', updated_at: 1 },
          'not-an-object',
        ],
      },
    });
    expect(r.status).toBe(200);
    expect(r.body.accepted).toEqual(['ok1']);
    expect(r.body.rejected.map((x: { reason: string }) => x.reason)).toEqual([
      'unknown_field:$where',
      'invalid_value:name',
      'invalid_value:name',
      'updated_at_in_future',
      'invalid_id',
      'value_too_large:name',
      'invalid_created_at',
      'not_an_object',
    ]);
  });

  it('rejects bad requests as a whole', async () => {
    const t = await setup();
    const a = await signInEmail(t, 'w@example.com');
    const tok = { token: a.accessToken };
    expect((await call(t, 'POST', '/sync/push', { ...tok, body: { table: 'users', rows: [] } })).status).toBe(400);
    expect((await call(t, 'POST', '/sync/push', { ...tok, body: { table: 'refresh_tokens', rows: [] } })).status).toBe(400);
    expect((await call(t, 'POST', '/sync/push', { ...tok, body: { table: 'cards', rows: {} } })).status).toBe(400);
    expect((await call(t, 'POST', '/sync/push', { ...tok, body: { table: 'cards', rows: Array.from({ length: 501 }, (_, i) => row(`r${i}`, 1)) } })).status).toBe(400);
    expect((await call(t, 'GET', '/sync/pull?tables=users', tok)).status).toBe(400);
    expect((await call(t, 'GET', '/sync/pull?since=-1', tok)).status).toBe(400);
    expect((await call(t, 'GET', '/sync/pull?limit=9999', tok)).status).toBe(400);
  });

  it("another user's token can never read or overwrite your rows", async () => {
    const t = await setup();
    const a = await signInEmail(t, 'alice@example.com');
    const b = await signInEmail(t, 'bob@example.com');
    await call(t, 'POST', '/sync/push', { token: a.accessToken, body: { table: 'photos', rows: [row('p1', 1000, { date: 'd', local_uri: 'file:///alice.jpg' })] } });
    // Bob pushes the same id with a newer timestamp and Alice's user_id.
    const hijack = await call(t, 'POST', '/sync/push', {
      token: b.accessToken,
      body: { table: 'photos', rows: [row('p1', 9000, { date: 'd', local_uri: 'file:///bob.jpg', user_id: a.user.id })] },
    });
    expect(hijack.body.accepted).toEqual(['p1']); // stored as Bob's own row
    const alice = await call(t, 'GET', '/sync/pull', { token: a.accessToken });
    expect(alice.body.changes.photos).toEqual([expect.objectContaining({ id: 'p1', local_uri: 'file:///alice.jpg', user_id: a.user.id })]);
    const bob = await call(t, 'GET', '/sync/pull', { token: b.accessToken });
    expect(bob.body.changes.photos).toEqual([expect.objectContaining({ id: 'p1', local_uri: 'file:///bob.jpg', user_id: b.user.id })]);
    expect(JSON.stringify(bob.body)).not.toContain('alice');
  });

  it('anonymous accounts cannot sync (backup needs sign-in)', async () => {
    const t = await setup();
    const anon = await call(t, 'POST', '/auth/anonymous', { body: {} });
    const r = await call(t, 'GET', '/sync/pull', { token: anon.body.accessToken });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('account_required');
  });
});
