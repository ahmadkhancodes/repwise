import { getRawDb, resetDbForTests } from '@/db/client';
import { batchLocalWrites, isBatchingLocalWrites, onLocalWrite } from '@/db/events';
import { migrateDb, migrations } from '@/db/migrate';
import { setRowOwner } from '@/db/owner';
import { DIRTY } from '@/db/repo';
import { inTransaction, withTransaction } from '@/db/transaction';
import { sessionExercisesRepo, sessionsRepo, setsRepo } from '@/features/workout/repo';

let writes: string[] = [];
let off: () => void = () => undefined;

beforeEach(async () => {
  resetDbForTests();
  setRowOwner(null);
  await migrateDb();
  writes = [];
  off = onLocalWrite((t) => writes.push(t));
});
afterEach(() => off());

const count = (table: string) =>
  (getRawDb().getFirstSync(`SELECT COUNT(*) AS n FROM ${table}`) as { n: number }).n;

const plan = (q: string) =>
  (getRawDb().getAllSync(`EXPLAIN QUERY PLAN ${q}`) as { detail: string }[])
    .map((r) => r.detail)
    .join(' | ');

describe('migration 0002_perf_indexes', () => {
  it('is in the journal and creates every hot-path index', () => {
    expect(migrations.journal.entries.map((e) => e.tag)).toContain('0002_perf_indexes');
    const idx = (
      getRawDb().getAllSync("SELECT name FROM sqlite_master WHERE type = 'index'") as {
        name: string;
      }[]
    ).map((r) => r.name);
    for (const name of [
      'session_exercises_exercise_idx',
      'session_exercises_session_pos_idx',
      'sets_session_exercise_idx_idx',
      'sessions_status_ended_idx',
      'sessions_status_started_idx',
      'sessions_user_date_idx',
      'meal_plans_date_updated_idx',
      'meals_plan_created_idx',
      'food_logs_date_idx',
      'food_logs_meal_idx',
      'sets_dirty_idx',
      'sessions_dirty_idx',
      'routines_dirty_idx',
    ]) {
      expect(idx).toContain(name);
    }
    // Replaced by the composite indexes above.
    expect(idx).not.toContain('sets_session_exercise_idx');
    expect(idx).not.toContain('session_exercises_session_idx');
  });

  it('the hot queries use the indexes (no full scans, no temp sort)', () => {
    expect(plan("SELECT * FROM session_exercises WHERE exercise_id = 'x'")).toContain(
      'session_exercises_exercise_idx',
    );
    const done = plan(
      "SELECT * FROM sessions WHERE deleted_at IS NULL AND status = 'done' ORDER BY ended_at DESC LIMIT 60",
    );
    expect(done).toContain('sessions_status_ended_idx');
    expect(done).not.toContain('TEMP B-TREE');
    const setsOf = plan(
      "SELECT * FROM sets WHERE deleted_at IS NULL AND session_exercise_id = 'x' ORDER BY idx",
    );
    expect(setsOf).toContain('sets_session_exercise_idx_idx');
    expect(setsOf).not.toContain('TEMP B-TREE');
    const ses = plan(
      "SELECT * FROM session_exercises WHERE deleted_at IS NULL AND session_id = 'x' ORDER BY position",
    );
    expect(ses).toContain('session_exercises_session_pos_idx');
    expect(ses).not.toContain('TEMP B-TREE');
    expect(plan("SELECT * FROM sessions WHERE user_id = 'u' AND date = '2026-11-19'")).toContain(
      'sessions_',
    );
    expect(plan("SELECT * FROM food_logs WHERE date = '2026-11-19'")).toContain(
      'food_logs_date_idx',
    );
    expect(plan("SELECT * FROM meals WHERE meal_plan_id = 'p' ORDER BY created_at")).toContain(
      'meals_plan_created_idx',
    );
    // The sync push scan only touches rows waiting to be pushed.
    expect(plan('SELECT * FROM sets WHERE dirty = 1')).toContain('sets_dirty_idx');
  });
});

describe('repo writes (no read-before-write)', () => {
  it('update stamps updated_at = max(now, previous + 1) in one statement', () => {
    const s = sessionsRepo.insert({ title: 'A' }, 1000);
    writes = [];
    expect(sessionsRepo.update(s.id, { title: 'B' }, 2000)!.updatedAt).toBe(2000);
    // A row from a device whose clock runs ahead still loses to a local edit.
    getRawDb().runSync('UPDATE sessions SET updated_at = 9000, dirty = 0 WHERE id = ?', s.id);
    const after = sessionsRepo.update(s.id, { title: 'C' }, 3000)!;
    expect(after.updatedAt).toBe(9001);
    expect(after.dirty).toBe(DIRTY.pending);
    expect(after.title).toBe('C');
    expect(writes).toEqual(['sessions', 'sessions']);
  });

  it('update of a missing row returns undefined and signals nothing', () => {
    expect(sessionsRepo.update('missing', { title: 'x' })).toBeUndefined();
    expect(writes).toEqual([]);
  });

  it('remove soft-deletes once; a second remove is a no-op', () => {
    const s = sessionsRepo.insert({ title: 'A' }, 1000);
    expect(sessionsRepo.remove(s.id, 5000)).toBe(true);
    const row = sessionsRepo.getIncludingDeleted(s.id)!;
    expect(row.deletedAt).toBe(5000);
    expect(row.updatedAt).toBe(5000);
    expect(sessionsRepo.remove(s.id, 6000)).toBe(false);
    expect(sessionsRepo.remove('missing')).toBe(false);
  });

  it('insertMany writes every row in one transaction with one signal', () => {
    const se = sessionExercisesRepo.insert({ sessionId: 's', exerciseId: 'squat' });
    writes = [];
    const rows = setsRepo.insertMany(
      Array.from({ length: 450 }, (_, i) => ({ sessionExerciseId: se.id, idx: i, reps: 5 })),
      7,
    );
    expect(rows).toHaveLength(450);
    expect(rows[449]!.idx).toBe(449);
    expect(
      rows.every((r) => r.createdAt === 7 && r.dirty === DIRTY.pending && r.deletedAt == null),
    ).toBe(true);
    expect(new Set(rows.map((r) => r.id)).size).toBe(450);
    expect(count('sets')).toBe(450);
    expect(writes).toEqual(['sets']);
    expect(setsRepo.insertMany([])).toEqual([]);
  });

  it('removeMany soft-deletes in bulk and skips rows already deleted', () => {
    const ids = setsRepo
      .insertMany(
        Array.from({ length: 600 }, (_, i) => ({ sessionExerciseId: 'se', idx: i })),
        1,
      )
      .map((r) => r.id);
    setsRepo.remove(ids[0]!, 2);
    writes = [];
    expect(setsRepo.removeMany(ids, 3)).toBe(599);
    expect(setsRepo.list()).toHaveLength(0);
    expect(writes).toEqual(['sets']);
    expect(setsRepo.removeMany([])).toBe(0);
  });
});

describe('withTransaction', () => {
  it('commits every write together and signals each table once, after commit', () => {
    let seenDuring: string[] = [];
    const out = withTransaction(() => {
      expect(inTransaction()).toBe(true);
      const s = sessionsRepo.insert({ title: 'Push' });
      for (let i = 0; i < 4; i++) setsRepo.insert({ sessionExerciseId: 'se', idx: i });
      sessionsRepo.update(s.id, { status: 'active' });
      seenDuring = [...writes];
      return s.id;
    });
    expect(seenDuring).toEqual([]); // nothing announced mid-transaction
    expect(writes.sort()).toEqual(['sessions', 'sets']);
    expect(sessionsRepo.get(out)!.status).toBe('active');
    expect(count('sets')).toBe(4);
    expect(inTransaction()).toBe(false);
  });

  it('rolls everything back on a throw and signals nothing', () => {
    expect(() =>
      withTransaction(() => {
        sessionsRepo.insert({ title: 'Half' });
        setsRepo.insert({ sessionExerciseId: 'se', idx: 0 });
        throw new Error('killed mid-way');
      }),
    ).toThrow('killed mid-way');
    expect(count('sessions')).toBe(0);
    expect(count('sets')).toBe(0);
    expect(writes).toEqual([]);
    expect(inTransaction()).toBe(false);
    // The connection is usable afterwards (no dangling transaction).
    withTransaction(() => sessionsRepo.insert({ title: 'After' }));
    expect(count('sessions')).toBe(1);
  });

  it('nests as a savepoint: a caught inner failure undoes only the inner writes', () => {
    withTransaction(() => {
      sessionsRepo.insert({ title: 'Outer' });
      try {
        withTransaction(() => {
          sessionsRepo.insert({ title: 'Inner' });
          throw new Error('inner');
        });
      } catch {
        // keep the outer work
      }
      withTransaction(() => sessionsRepo.insert({ title: 'Inner ok' }));
    });
    expect(
      sessionsRepo
        .list()
        .map((s) => s.title)
        .sort(),
    ).toEqual(['Inner ok', 'Outer']);
  });

  it('rejects an async body and rolls it back', async () => {
    expect(() =>
      withTransaction(async () => {
        sessionsRepo.insert({ title: 'Async' });
      }),
    ).toThrow(TypeError);
    expect(count('sessions')).toBe(0);
    await Promise.resolve();
  });
});

describe('batchLocalWrites', () => {
  it('dedupes signals per table and flushes at the outermost batch only', () => {
    batchLocalWrites(() => {
      expect(isBatchingLocalWrites()).toBe(true);
      batchLocalWrites(() => {
        sessionsRepo.insert({ title: 'a' });
        sessionsRepo.insert({ title: 'b' });
      });
      expect(writes).toEqual([]);
      setsRepo.insert({ sessionExerciseId: 'x', idx: 0 });
    });
    expect(writes).toEqual(['sessions', 'sets']);
    expect(isBatchingLocalWrites()).toBe(false);
  });

  it('a listener that throws never breaks the write or other listeners', () => {
    const bad = onLocalWrite(() => {
      throw new Error('listener');
    });
    expect(() => sessionsRepo.insert({ title: 'ok' })).not.toThrow();
    expect(writes).toEqual(['sessions']);
    bad();
  });
});
