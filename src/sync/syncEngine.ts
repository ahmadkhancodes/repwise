/**
 * Sync engine (sheets 13/14): push dirty rows, then pull by the server's cursor.
 *
 * - Push: rows with dirty = 1, ≤ 500 rows and ≤ ~1.5 MB per request. `accepted` and `conflicts`
 *   (server already has an equal or newer row) both settle the row; `rejected` rows get dirty = 2
 *   so they are not retried until edited again. A row edited while its push was in flight stays
 *   dirty (we only settle the exact updated_at we sent).
 * - Pull: GET /sync/pull pages by server write time (syncedAt); loop while nextCursor is set, then
 *   store nextSince for this account. Rows merge last-write-wins on updated_at in one transaction
 *   per page; soft deletes arrive as rows like any other.
 * - Only signed-in (non-anonymous) accounts sync. Errors never reach the UI as exceptions: they
 *   land in useSyncStatus. Local data is never deleted by sync.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { create } from 'zustand';

import { getDb } from '@/db/client';
import { DIRTY } from '@/db/repo';
import { cards, SYNC_TABLE_NAMES, syncTables, type SyncTableName } from '@/db/schema';
import { api, isApiError, isNetworkError } from '@/services/api';
import { syncAccountId } from '@/services/auth';
import { kv } from '@/services/storage';

import { decide } from './conflict';
import { fromRemote, toRemote, type RemoteRow } from './mappers';

type AnyTable = typeof cards;
const tableOf = (name: SyncTableName) => syncTables[name] as unknown as AnyTable;

export const PUSH_MAX_ROWS = 500;
export const PUSH_MAX_BYTES = 1_500_000;

type PushResponse = {
  accepted: string[];
  conflicts: string[];
  rejected: { id: string | null; reason: string }[];
  serverTime: number;
};

type PullResponse = {
  changes: Record<string, unknown[]>;
  nextCursor: string | null;
  nextSince: number;
  serverTime: number;
};

export type SyncResult =
  | { status: 'skipped'; reason: 'signed_out' }
  | { status: 'ok'; pushed: number; pulled: number; rejected: number }
  | { status: 'error'; error: string; offline: boolean };

type SyncStatus = {
  running: boolean;
  lastSyncAt: number | null;
  lastPullAt: number | null;
  lastError: string | null;
  offline: boolean;
};

export const useSyncStatus = create<SyncStatus>(() => ({
  running: false,
  lastSyncAt: null,
  lastPullAt: null,
  lastError: null,
  offline: false,
}));

const sinceKey = (userId: string) => `sync.since.${userId}`;

export function getPullSince(userId: string): number {
  const v = Number(kv.getString(sinceKey(userId)) ?? 0);
  return Number.isSafeInteger(v) && v >= 0 ? v : 0;
}

export function resetPullCursor(userId: string): void {
  kv.remove(sinceKey(userId));
}

// ---------- push ----------

/** Split rows into requests the Worker accepts (≤ 500 rows, ≤ 2 MB body). Pure. */
export function chunkRows(rows: RemoteRow[], maxRows = PUSH_MAX_ROWS, maxBytes = PUSH_MAX_BYTES): RemoteRow[][] {
  const out: RemoteRow[][] = [];
  let cur: RemoteRow[] = [];
  let bytes = 0;
  for (const r of rows) {
    const size = JSON.stringify(r).length + 1;
    if (cur.length > 0 && (cur.length >= maxRows || bytes + size > maxBytes)) {
      out.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(r);
    bytes += size;
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

function settle(name: SyncTableName, sent: Map<string, number>, ids: string[], to: number): void {
  const t = tableOf(name);
  const db = getDb();
  db.transaction((tx) => {
    for (const id of ids) {
      const updatedAt = sent.get(id);
      if (updatedAt === undefined) continue;
      tx.update(t)
        .set({ dirty: to })
        .where(and(eq(t.id, id), eq(t.updatedAt, updatedAt), eq(t.dirty, DIRTY.pending)))
        .run();
    }
  });
}

async function pushTable(name: SyncTableName): Promise<{ pushed: number; rejected: number }> {
  const t = tableOf(name);
  let pushed = 0;
  let rejected = 0;
  // Re-read after each round: rows written meanwhile go in the next round.
  for (let round = 0; round < 50; round++) {
    const rows = getDb()
      .select()
      .from(t)
      .where(eq(t.dirty, DIRTY.pending))
      .limit(PUSH_MAX_ROWS)
      .all() as Record<string, unknown>[];
    if (rows.length === 0) break;
    let settled = 0;
    for (const batch of chunkRows(rows.map((r) => toRemote(name, r)))) {
      const sent = new Map(batch.map((r) => [String(r.id), Number(r.updated_at)]));
      const res = await api.post<PushResponse>('/sync/push', { table: name, rows: batch }, { auth: 'required' });
      settle(name, sent, [...res.accepted, ...res.conflicts], DIRTY.clean);
      const bad = res.rejected.map((r) => r.id).filter((id): id is string => typeof id === 'string');
      settle(name, sent, bad, DIRTY.rejected);
      pushed += res.accepted.length;
      rejected += bad.length;
      settled += res.accepted.length + res.conflicts.length + bad.length;
    }
    if (settled === 0 || rows.length < PUSH_MAX_ROWS) break;
  }
  return { pushed, rejected };
}

// ---------- pull ----------

/** Merge one page of remote rows (last-write-wins). Returns how many local rows changed. */
export function mergeRemoteRows(name: SyncTableName, remoteRows: unknown[], userId: string): number {
  const t = tableOf(name);
  const incoming = remoteRows
    .map((r) => fromRemote(name, r, userId))
    .filter((r): r is Record<string, unknown> => r !== null);
  if (incoming.length === 0) return 0;
  let changed = 0;
  const db = getDb();
  db.transaction((tx) => {
    const ids = incoming.map((r) => String(r.id));
    const existing = new Map<string, number>();
    for (let i = 0; i < ids.length; i += 500) {
      const found = tx
        .select({ id: t.id, updatedAt: t.updatedAt })
        .from(t)
        .where(inArray(t.id, ids.slice(i, i + 500)))
        .all();
      for (const f of found) existing.set(f.id, f.updatedAt);
    }
    for (const row of incoming) {
      const id = String(row.id);
      const localUpdated = existing.get(id);
      const d = decide(localUpdated === undefined ? undefined : { updatedAt: localUpdated }, {
        updatedAt: Number(row.updatedAt),
      });
      if (d === 'keep') continue;
      tx.insert(t)
        .values(row as never)
        .onConflictDoUpdate({ target: t.id, set: row as never })
        .run();
      existing.set(id, Number(row.updatedAt));
      changed++;
    }
  });
  return changed;
}

async function pull(userId: string): Promise<number> {
  let since = getPullSince(userId);
  let cursor: string | null = null;
  let pulled = 0;
  for (let page = 0; page < 1000; page++) {
    const res: PullResponse = await api.get<PullResponse>('/sync/pull', {
      auth: 'required',
      query: cursor ? { cursor } : { since },
    });
    // Signed out or switched account mid-pull: never write another account's rows.
    if (syncAccountId() !== userId) return pulled;
    for (const [table, rows] of Object.entries(res.changes ?? {})) {
      if ((SYNC_TABLE_NAMES as string[]).includes(table) && Array.isArray(rows)) {
        pulled += mergeRemoteRows(table as SyncTableName, rows, userId);
      }
    }
    cursor = res.nextCursor;
    if (!cursor) {
      since = res.nextSince;
      kv.set(sinceKey(userId), String(since));
      break;
    }
  }
  return pulled;
}

// ---------- run ----------

let running: Promise<SyncResult> | null = null;
let rerun: { pull: boolean } | null = null;

async function runOnce(opts: { pull: boolean }): Promise<SyncResult> {
  const userId = syncAccountId();
  if (!userId) return { status: 'skipped', reason: 'signed_out' };
  useSyncStatus.setState({ running: true });
  try {
    let pushed = 0;
    let rejected = 0;
    for (const name of SYNC_TABLE_NAMES) {
      if (syncAccountId() !== userId) break;
      const r = await pushTable(name);
      pushed += r.pushed;
      rejected += r.rejected;
    }
    let pulled = 0;
    const now = Date.now();
    if (opts.pull && syncAccountId() === userId) {
      pulled = await pull(userId);
      useSyncStatus.setState({ lastPullAt: now });
    }
    useSyncStatus.setState({ lastSyncAt: now, lastError: null, offline: false });
    return { status: 'ok', pushed, pulled, rejected };
  } catch (e) {
    const offline = isNetworkError(e);
    const error = isApiError(e) ? (e.code ?? e.kind) : 'unknown';
    useSyncStatus.setState({ lastError: error, offline });
    return { status: 'error', error, offline };
  } finally {
    useSyncStatus.setState({ running: false });
  }
}

/**
 * Run a sync now (push, then pull when `pull` is true). Single-flight: a call during a run
 * schedules one more run afterwards and resolves with that run's result. Never throws.
 */
export function syncNow(opts: { pull?: boolean } = {}): Promise<SyncResult> {
  const want = { pull: opts.pull ?? true };
  if (running) {
    rerun = { pull: (rerun?.pull ?? false) || want.pull };
    return running; // the running loop picks up `rerun` before it resolves
  }
  running = (async () => {
    let result = await runOnce(want);
    while (rerun) {
      const next = rerun;
      rerun = null;
      result = await runOnce(next);
    }
    return result;
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Tests only. */
export function resetSyncForTests(): void {
  running = null;
  rerun = null;
  useSyncStatus.setState({ running: false, lastSyncAt: null, lastPullAt: null, lastError: null, offline: false });
}
