/**
 * `withTransaction(fn)`: run several local writes as ONE atomic SQLite transaction (perf audit A6).
 *
 * - Atomic: a crash or a throw part-way leaves nothing half-written (CLAUDE.md: never lose data).
 * - Fast: one WAL commit instead of one per row (a 24-row "start workout" goes from ~24 fsyncs
 *   to 1), and the repos' write signals are coalesced: listeners (sync, notifications, widgets)
 *   hear once per table on commit, nothing on rollback.
 * - Synchronous, like every repo call: `fn` must not be async (it would commit before its awaits
 *   ran), so a returned promise is rolled back and rejected with a TypeError.
 * - Nestable: an inner call becomes a SAVEPOINT, so an inner failure the caller catches undoes only
 *   the inner writes.
 * - Use the normal repos inside (they all use the one connection):
 *     withTransaction(() => { sessionsRepo.update(id, …); for (const s of rows) setsRepo.insert(s); });
 */
import { getRawDb } from './client';
import { batchLocalWrites } from './events';

let depth = 0;

function isThenable(x: unknown): boolean {
  return (
    x != null &&
    (typeof x === 'object' || typeof x === 'function') &&
    typeof (x as { then?: unknown }).then === 'function'
  );
}

export function withTransaction<T>(fn: () => T): T {
  const raw = getRawDb();
  const sp = `rw_sp_${depth}`;
  const nested = depth > 0;
  return batchLocalWrites(() => {
    raw.execSync(nested ? `SAVEPOINT ${sp}` : 'BEGIN IMMEDIATE');
    depth += 1;
    let out: T;
    try {
      out = fn();
      if (isThenable(out)) {
        // Swallow the stray promise's own rejection; the caller gets the TypeError below.
        (out as unknown as Promise<unknown>).then(undefined, () => undefined);
        throw new TypeError('withTransaction: fn must be synchronous (it returned a promise)');
      }
    } catch (e) {
      depth -= 1;
      try {
        raw.execSync(nested ? `ROLLBACK TO ${sp}; RELEASE ${sp}` : 'ROLLBACK');
      } catch {
        // SQLite already rolled back (e.g. after SQLITE_FULL); the original error matters more.
      }
      throw e;
    }
    depth -= 1;
    try {
      raw.execSync(nested ? `RELEASE ${sp}` : 'COMMIT');
    } catch (e) {
      try {
        raw.execSync(nested ? `ROLLBACK TO ${sp}; RELEASE ${sp}` : 'ROLLBACK');
      } catch {
        // nothing left to undo
      }
      throw e;
    }
    return out;
  });
}

/** True while inside `withTransaction` (e.g. to assert a helper runs inside one). */
export function inTransaction(): boolean {
  return depth > 0;
}
