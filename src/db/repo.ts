import { and, eq, isNull, type SQL } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';

import { uuidv7 } from '@/lib/ids';

import { getDb } from './client';
import { notifyLocalWrite } from './events';
import { getRowOwner } from './owner';
import { cards, type SyncTable, type SyncTableName } from './schema';

type CommonKey = 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'dirty';

export type Row<T extends SyncTable> = T['$inferSelect'];
/** Fields a caller may set on insert. Common columns are managed by the repo (id is optional). */
export type NewRow<T extends SyncTable> = Omit<T['$inferInsert'], CommonKey> & { id?: string };
/** Fields a caller may change on update. */
export type RowPatch<T extends SyncTable> = Partial<Omit<T['$inferInsert'], CommonKey>>;

/** Shape shared by every sync table (used internally to reach the common columns generically). */
type AnyTable = typeof cards;

export const DIRTY = { clean: 0, pending: 1, rejected: 2 } as const;

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

  function update(id: string, patch: RowPatch<T>, now: number = Date.now()): R | undefined {
    const prev = getIncludingDeleted(id) as { updatedAt: number } | undefined;
    if (!prev) return undefined;
    const saved = getDb()
      .update(t)
      .set({
        ...(patch as object),
        updatedAt: nextUpdatedAt(now, prev.updatedAt),
        dirty: DIRTY.pending,
      } as never)
      .where(eq(t.id, id))
      .returning()
      .get() as R | undefined;
    notifyLocalWrite(name);
    return saved;
  }

  /** Soft delete so the delete syncs (sheet 13). */
  function remove(id: string, now: number = Date.now()): boolean {
    const prev = getIncludingDeleted(id) as
      { updatedAt: number; deletedAt: number | null } | undefined;
    if (!prev || prev.deletedAt != null) return false;
    const at = nextUpdatedAt(now, prev.updatedAt);
    getDb()
      .update(t)
      .set({ deletedAt: at, updatedAt: at, dirty: DIRTY.pending })
      .where(eq(t.id, id))
      .run();
    notifyLocalWrite(name);
    return true;
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
   * Live list for screens: re-runs when this table changes (expo-sqlite change listener).
   * Pass `deps` for any value used in `where` so the query is rebuilt when it changes.
   */
  function useLive(
    where?: SQL,
    orderBy?: SQL | SQLiteColumn,
    deps: unknown[] = [],
  ): { data: R[]; error?: Error } {
    const q = getDb().select().from(t).where(notDeleted(where));
    const res = useLiveQuery(orderBy ? q.orderBy(orderBy) : q, deps);
    return { data: res.data as R[], error: res.error };
  }

  return { table, name, get, getIncludingDeleted, insert, update, remove, list, first, useLive };
}

export type Repo<T extends SyncTable> = ReturnType<typeof createRepo<T>>;
