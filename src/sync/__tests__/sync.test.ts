import { COMMON_COLUMNS, STRIPPED_COLUMNS, SYNC_TABLES } from '../../../server/src/sync/tables';
import { createFakeFetch, tokenResponse } from '../../../test/fakeFetch';

import { resetDbForTests } from '@/db/client';
import { migrateDb } from '@/db/migrate';
import { SYNC_TABLE_NAMES } from '@/db/schema';
import { getProfile, saveProfile } from '@/features/settings/repo';
import { sessionsRepo } from '@/features/workout/repo';
import { configureApi, resetApiForTests } from '@/services/api';
import { resetAuthForTests, useAuth } from '@/services/auth';
import { kv } from '@/services/storage';
import { resetTokensForTests, saveSession } from '@/services/tokens';
import { decide } from '@/sync/conflict';
import { columnsOf, fromRemote, pushedColumnNames, toRemote } from '@/sync/mappers';
import { shouldPull, PULL_MIN_INTERVAL_MS } from '@/sync/scheduler';
import {
  chunkRows,
  getPullSince,
  mergeRemoteRows,
  resetSyncForTests,
  syncNow,
  useSyncStatus,
} from '@/sync/syncEngine';

describe('server allow-list contract', () => {
  it('local tables are exactly the server sync tables, in the same order', () => {
    expect(SYNC_TABLE_NAMES).toEqual(Object.keys(SYNC_TABLES));
  });

  it.each(Object.keys(SYNC_TABLES))(
    '%s columns match server/src/sync/tables.ts exactly',
    (table) => {
      const local = pushedColumnNames(table as never).sort();
      expect(local).toEqual([...COMMON_COLUMNS, ...SYNC_TABLES[table]!].sort());
      const all = columnsOf(table as never).map((c) => c.sql);
      for (const c of STRIPPED_COLUMNS) expect(all).toContain(c);
    },
  );
});

describe('mappers', () => {
  const local = {
    id: 'p1',
    userId: 'u',
    createdAt: 1,
    updatedAt: 2,
    deletedAt: null,
    dirty: 1,
    goal: 'lose_fat',
    equipment: ['dumbbell'],
    days: 3,
    name: null,
  };

  it('toRemote: snake_case, JSON text, no dirty/user_id', () => {
    const r = toRemote('profile', local);
    expect(r).toMatchObject({
      id: 'p1',
      created_at: 1,
      updated_at: 2,
      deleted_at: null,
      goal: 'lose_fat',
      equipment: '["dumbbell"]',
      days: 3,
    });
    expect(r).not.toHaveProperty('dirty');
    expect(r).not.toHaveProperty('user_id');
    expect(
      Object.values(r).every(
        (v) => v === null || ['string', 'number', 'boolean'].includes(typeof v),
      ),
    ).toBe(true);
  });

  it('booleans travel as 0/1 and come back as booleans', () => {
    const r = toRemote('exercises', {
      id: 'e',
      createdAt: 1,
      updatedAt: 1,
      name: 'X',
      isCustom: true,
    });
    expect(r.is_custom).toBe(1);
    expect(fromRemote('exercises', { ...r, is_custom: 1 }, 'u')).toMatchObject({ isCustom: true });
  });

  it('fromRemote: parses JSON, owns the row, clean, ignores unknown fields, rejects junk', () => {
    const back = fromRemote(
      'profile',
      { ...toRemote('profile', local), future_col: 'x', user_id: 'other' },
      'me',
    );
    expect(back).toMatchObject({
      id: 'p1',
      userId: 'me',
      dirty: 0,
      equipment: ['dumbbell'],
      goal: 'lose_fat',
    });
    expect(back).not.toHaveProperty('future_col');
    expect(fromRemote('profile', { id: 'x' }, 'me')).toBeNull();
    expect(fromRemote('profile', null, 'me')).toBeNull();
    expect(
      fromRemote('profile', { id: 'x', created_at: 1, updated_at: 1, equipment: '{bad' }, 'me'),
    ).toMatchObject({ equipment: null });
  });
});

describe('conflict + scheduling (pure)', () => {
  it('last-write-wins on updated_at; ties keep local', () => {
    expect(decide(undefined, { updatedAt: 1 })).toBe('insert');
    expect(decide({ updatedAt: 1 }, { updatedAt: 2 })).toBe('replace');
    expect(decide({ updatedAt: 2 }, { updatedAt: 2 })).toBe('keep');
    expect(decide({ updatedAt: 3 }, { updatedAt: 2 })).toBe('keep');
  });

  it('pull at most every 5 minutes on foreground', () => {
    expect(shouldPull(null, 0)).toBe(true);
    expect(shouldPull(1000, 1000 + PULL_MIN_INTERVAL_MS - 1)).toBe(false);
    expect(shouldPull(1000, 1000 + PULL_MIN_INTERVAL_MS)).toBe(true);
  });

  it('chunks pushes by row count and bytes', () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({ id: String(i), note: 'x'.repeat(100) }));
    expect(chunkRows(rows, 3).map((c) => c.length)).toEqual([3, 3, 1]);
    expect(chunkRows(rows, 500, 250).map((c) => c.length)).toEqual([2, 2, 2, 1]);
    expect(chunkRows([])).toEqual([]);
  });
});

describe('merge (real SQLite)', () => {
  beforeEach(async () => {
    resetDbForTests();
    await migrateDb();
  });

  const remote = (over: Record<string, unknown> = {}) => ({
    id: 's1',
    created_at: 100,
    updated_at: 200,
    deleted_at: null,
    date: '2026-11-19',
    title: 'Remote',
    ...over,
  });

  it('inserts new rows clean and owned', () => {
    expect(mergeRemoteRows('sessions', [remote()], 'u1')).toBe(1);
    expect(sessionsRepo.get('s1')).toMatchObject({ title: 'Remote', userId: 'u1', dirty: 0 });
  });

  it('newer remote replaces, older or equal is ignored', () => {
    sessionsRepo.insert({ id: 's1', title: 'Local' }, 300);
    expect(mergeRemoteRows('sessions', [remote({ updated_at: 250 })], 'u1')).toBe(0);
    expect(sessionsRepo.get('s1')).toMatchObject({ title: 'Local', dirty: 1 });
    expect(mergeRemoteRows('sessions', [remote({ updated_at: 300 })], 'u1')).toBe(0);
    expect(mergeRemoteRows('sessions', [remote({ updated_at: 400, title: 'Newer' })], 'u1')).toBe(
      1,
    );
    expect(sessionsRepo.get('s1')).toMatchObject({ title: 'Newer', dirty: 0, updatedAt: 400 });
  });

  it('a remote soft delete hides the row locally', () => {
    sessionsRepo.insert({ id: 's1', title: 'Local' }, 100);
    mergeRemoteRows('sessions', [remote({ updated_at: 500, deleted_at: 500 })], 'u1');
    expect(sessionsRepo.get('s1')).toBeUndefined();
    expect(sessionsRepo.getIncludingDeleted('s1')).toMatchObject({ deletedAt: 500 });
  });

  it('skips malformed rows', () => {
    expect(mergeRemoteRows('sessions', [{ id: 's9' }, 'junk', remote({ id: 's2' })], 'u1')).toBe(1);
  });
});

describe('syncNow against a fake Worker', () => {
  let fake: ReturnType<typeof createFakeFetch>;
  /** server-side store: table → id → row */
  let server: Map<string, Map<string, Record<string, unknown>>>;

  beforeEach(async () => {
    resetDbForTests();
    await migrateDb();
    resetApiForTests();
    resetTokensForTests();
    resetAuthForTests();
    resetSyncForTests();
    kv.remove('sync.since.user-1');
    fake = createFakeFetch();
    configureApi({ baseUrl: fake.base, fetch: fake.fetch });
    server = new Map();
    fake.on('POST /sync/push', (c) => {
      const { table, rows } = c.body as { table: string; rows: Record<string, unknown>[] };
      const t = server.get(table) ?? new Map();
      server.set(table, t);
      const accepted: string[] = [];
      const conflicts: string[] = [];
      const rejected: { id: string; reason: string }[] = [];
      for (const r of rows) {
        if (r.title === 'BAD') {
          rejected.push({ id: String(r.id), reason: 'value_too_large:title' });
          continue;
        }
        const ex = t.get(String(r.id));
        if (ex && Number(ex.updated_at) >= Number(r.updated_at)) conflicts.push(String(r.id));
        else {
          t.set(String(r.id), r);
          accepted.push(String(r.id));
        }
      }
      return { status: 200, body: { accepted, conflicts, rejected, serverTime: 1 } };
    });
    await saveSession({ ...tokenResponse(0), accessExpiresAt: Date.now() + 600_000 } as never);
    useAuth.setState({ status: 'signedIn', user: { id: 'user-1', email: null, anonymous: false } });
  });

  it('skips when signed out or anonymous (no network)', async () => {
    useAuth.setState({ status: 'anonymous', user: { id: 'anon', email: null, anonymous: true } });
    expect(await syncNow()).toEqual({ status: 'skipped', reason: 'signed_out' });
    expect(fake.calls).toHaveLength(0);
  });

  it('pushes dirty rows, settles accepted/conflicts, marks rejected, then pulls with the cursor loop', async () => {
    const a = sessionsRepo.insert({ title: 'A' });
    const bad = sessionsRepo.insert({ title: 'BAD' });
    saveProfile({ goal: 'build_muscle' });
    const pulls: string[] = [];
    fake.on('GET /sync/pull', (c) => {
      pulls.push(c.query);
      if (!c.query.includes('cursor')) {
        return {
          status: 200,
          body: {
            changes: {
              sessions: [
                { id: 'r1', created_at: 1, updated_at: 2, deleted_at: null, title: 'From cloud' },
              ],
            },
            nextCursor: 'CUR1',
            nextSince: 0,
            serverTime: 9,
          },
        };
      }
      return {
        status: 200,
        body: { changes: {}, nextCursor: null, nextSince: 7000, serverTime: 9 },
      };
    });

    const res = await syncNow();
    expect(res).toEqual({ status: 'ok', pushed: 2, pulled: 1, rejected: 1 });
    expect(server.get('sessions')!.get(a.id)).toMatchObject({ title: 'A' });
    expect(server.get('profile')!.size).toBe(1);
    expect(sessionsRepo.get(a.id)!.dirty).toBe(0);
    expect(sessionsRepo.get(bad.id)!.dirty).toBe(2);
    expect(getProfile()!.dirty).toBe(0);
    expect(sessionsRepo.get('r1')).toMatchObject({
      title: 'From cloud',
      userId: 'user-1',
      dirty: 0,
    });
    expect(pulls).toEqual(['?since=0', '?cursor=CUR1']);
    expect(getPullSince('user-1')).toBe(7000);
    expect(useSyncStatus.getState()).toMatchObject({ lastError: null, running: false });

    // second run: nothing dirty → no push, pull resumes from nextSince
    fake.on('GET /sync/pull', (c) => {
      pulls.push(c.query);
      return {
        status: 200,
        body: { changes: {}, nextCursor: null, nextSince: 8000, serverTime: 9 },
      };
    });
    await syncNow();
    expect(fake.callsTo('POST /sync/push')).toHaveLength(2); // sessions + profile, first run only
    expect(pulls[2]).toBe('?since=7000');
  });

  it('a row edited while its push is in flight stays dirty', async () => {
    const a = sessionsRepo.insert({ title: 'A' }, 1000);
    fake.on('POST /sync/push', (c) => {
      sessionsRepo.update(a.id, { title: 'A2' }, 2000); // user edits during the request
      const ids = (c.body as { rows: { id: string }[] }).rows.map((r) => r.id);
      return { status: 200, body: { accepted: ids, conflicts: [], rejected: [], serverTime: 1 } };
    });
    await syncNow({ pull: false });
    expect(sessionsRepo.get(a.id)).toMatchObject({ title: 'A2', dirty: 1 });
  });

  it('offline: keeps rows dirty, records status, never throws', async () => {
    sessionsRepo.insert({ title: 'A' });
    fake.setOffline(true);
    const res = await syncNow();
    expect(res).toMatchObject({ status: 'error', offline: true });
    expect(sessionsRepo.list()[0]!.dirty).toBe(1);
    expect(useSyncStatus.getState()).toMatchObject({ offline: true, lastError: 'offline' });
  });

  it('concurrent syncNow calls share one run', async () => {
    fake.on('GET /sync/pull', () => ({
      status: 200,
      body: { changes: {}, nextCursor: null, nextSince: 1, serverTime: 1 },
    }));
    await Promise.all([syncNow(), syncNow(), syncNow()]);
    // first run + at most one queued re-run
    expect(fake.callsTo('GET /sync/pull').length).toBeLessThanOrEqual(2);
  });
});
