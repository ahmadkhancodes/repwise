import { and, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';

import { uuidv7 } from '@/lib/ids';

import { getDb } from './client';
import { notifyLocalWrite } from './events';
import { useLiveRows } from './live';
import { getRowOwner } from './owner';
import { cards, type SyncTable, type SyncTableName } from './schema';
import { withTransaction } from './transaction';

type CommonKey = 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'dirty';

export type Row<T extends SyncTable> = T['$inferSelect'];
/** Fields a caller may set on insert. Common columns are managed by the repo (id is optional). */
export type NewRow<T extends SyncTable> = Omit<T['$inferInsert'], CommonKey> & { id?: string };
/** Fields a caller may change on update. */
export type RowPatch<T extends SyncTable> = Partial<Omit<T['$inferInsert'], CommonKey>>;

/** Shape shared by every sync table (used internally to reach the common columns generically). */
type AnyTable = typeof cards;

export const DIRTY = { clean: 0, pending: 1, rejected: 2 } as const;

/** Rows per multi-row INSERT (15–30 columns each stays far under SQLite's bound-variable limit). */
const INSERT_CHUNK = 200;
/** Ids per `IN (…)` list. */
const IN_CHUNK = 500;

/**
 * Next updated_at for a row: wall clock, but always strictly after the previous value so a local
 * edit wins last-write-wins even if a row arrived from a device whose clock runs ahead.
 */
export function nextUpdatedAt(now: number, previous: number | null | undefined): number {
  return previous != null && previous >= now ? previous + 1 : now;
}

/**
 * Generic local repository for one sync table: every write stamps the common columns
 * (uuid v7 id, user_id, created_at/updated_at, dirty = 1), deletes are soft, reads skip deleted
 * rows, and every write pings the sync scheduler. All calls are synchronous local SQLite.
 */
export function createRepo<T extends SyncTable>(table: T, name: SyncTableName) {
  const t = table as unknown as AnyTable;
  type R = Row<T>;

  const notDeleted = (where?: SQL): SQL | undefined =>
    where ? and(isNull(t.deletedAt), where) : isNull(t.deletedAt);

  function getIncludingDeleted(id: string): R | undefined {
    return getDb().select().from(t).where(eq(t.id, id)).get() as R | undefined;
  }

  function get(id: string): R | undefined {
    return getDb()
      .select()
      .from(t)
      .where(and(eq(t.id, id), isNull(t.deletedAt)))
      .get() as R | undefined;
  }

  function insert(values: NewRow<T>, now: number = Date.now()): R {
    const row = {
      ...values,
      id: values.id ?? uuidv7(now),
      userId: getRowOwner(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      dirty: DIRTY.pending,
    };
    const saved = getDb()
      .insert(t)
      .values(row as never)
      .returning()
      .get() as R;
    notifyLocalWrite(name);
    return saved;
  }

  /**
   * Many rows in one statement per chunk, inside one transaction, one write signal (perf audit A6).
   * Same stamping as `insert`; returns the saved rows in input order.
   */
  function insertMany(values: readonly NewRow<T>[], now: number = Date.now()): R[] {
    if (values.length === 0) return [];
    const owner = getRowOwner();
    const rows = values.map((v) => ({
      ...v,
      id: v.id ?? uuidv7(now),
      userId: owner,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      dirty: DIRTY.pending,
    }));
    return withTransaction(() => {
      const out: R[] = [];
      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        const saved = getDb()
          .insert(t)
          .values(rows.slice(i, i + INSERT_CHUNK) as never)
          .returning()
          .all() as R[];
        out.push(...saved);
      }
      notifyLocalWrite(name);
      return out;
    });
  }

  /**
   * One UPDATE … RETURNING, no read first: updated_at = max(now, previous + 1) in SQL, so a local
   * edit still wins last-write-wins over a row from a device whose clock runs ahead.
   */
  function update(id: string, patch: RowPatch<T>, now: number = Date.now()): R | undefined {
    const saved = getDb()
      .update(t)
      .set({
        ...(patch as object),
        updatedAt: sql`max(${now}, ${t.updatedAt} + 1)`,
        dirty: DIRTY.pending,
      } as never)
      .where(eq(t.id, id))
      .returning()
      .get() as R | undefined;
    if (saved) notifyLocalWrite(name);
    return saved;
  }

  /** Soft delete so the delete syncs (sheet 13). One statement; false if missing or already deleted. */
  function remove(id: string, now: number = Date.now()): boolean {
    return removeMany([id], now) > 0;
  }

  /** Soft-delete many rows in one UPDATE … WHERE id IN (…); returns how many were deleted. */
  function removeMany(ids: readonly string[], now: number = Date.now()): number {
    if (ids.length === 0) return 0;
    const at = sql`max(${now}, ${t.updatedAt} + 1)`;
    let changed = 0;
    const run = () => {
      for (let i = 0; i < ids.length; i += IN_CHUNK) {
        const res = getDb()
          .update(t)
          .set({ deletedAt: at, updatedAt: at, dirty: DIRTY.pending } as never)
          .where(and(inArray(t.id, ids.slice(i, i + IN_CHUNK) as string[]), isNull(t.deletedAt)))
          .run();
        changed += res.changes;
      }
    };
    if (ids.length > IN_CHUNK) withTransaction(run);
    else run();
    if (changed > 0) notifyLocalWrite(name);
    return changed;
  }

  /** Undo a soft delete (the 5 s "Undo" toast). The restore syncs like any edit. */
  function restore(id: string, now: number = Date.now()): boolean {
    const at = sql`max(${now}, ${t.updatedAt} + 1)`;
    const res = getDb()
      .update(t)
      .set({ deletedAt: null, updatedAt: at, dirty: DIRTY.pending } as never)
      .where(and(eq(t.id, id), isNotNull(t.deletedAt)))
      .run();
    if (res.changes > 0) notifyLocalWrite(name);
    return res.changes > 0;
  }

  function list(where?: SQL, orderBy?: SQL | SQLiteColumn): R[] {
    const q = getDb().select().from(t).where(notDeleted(where));
    return (orderBy ? q.orderBy(orderBy) : q).all() as R[];
  }

  function first(where?: SQL, orderBy?: SQL | SQLiteColumn): R | undefined {
    const q = getDb().select().from(t).where(notDeleted(where));
    return (orderBy ? q.orderBy(orderBy) : q).limit(1).get() as R | undefined;
  }

  /**
   * Live list for screens: rows on the first render, then re-run (once per frame) when this table
   * changes, and only while the screen is focused (perf audit r2 N3/N4; a blurred screen refreshes
   * once on focus). Pass `deps` for any value used in `where` so the query is rebuilt when it changes.
   */
  function useLive(
    where?: SQL,
    orderBy?: SQL | SQLiteColumn,
    deps: unknown[] = [],
  ): { data: R[]; error?: Error } {
    const res = useLiveRows(
      () => {
        const q = getDb().select().from(t).where(notDeleted(where));
        return (orderBy ? q.orderBy(orderBy) : q) as unknown as { all: () => R[] };
      },
      [name],
      deps,
    );
    return { data: res.data, error: res.error };
  }

  return {
    table,
    name,
    get,
    getIncludingDeleted,
    insert,
    insertMany,
    update,
    remove,
    removeMany,
    restore,
    list,
    first,
    useLive,
  };
}

export type Repo<T extends SyncTable> = ReturnType<typeof createRepo<T>>;
