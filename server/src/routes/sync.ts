import { Hono } from 'hono';
import { b64url, b64urlDecode } from '../lib/crypto';
import { badRequest, forbidden, readJson } from '../lib/http';
import { rateLimit, requireUser } from '../lib/middleware';
import { SYNC_LIMITS, TABLE_NAMES } from '../sync/tables';
import { validateRow } from '../sync/validate';
import type { AppEnv } from '../types';

/**
 * Rows are stamped with a per-user monotonic `syncedAt` (hybrid: max(previous + 1, now ms), so
 * cursors from the older wall-clock scheme stay valid). Each push holds a lease while it writes, and
 * a pull's nextSince never passes the oldest lease's floor, so a slow write can never be skipped.
 * Rows above the high-water mark may be sent twice; the client's last-write-wins merge is idempotent.
 */
/** Before a user's first stamped write, rows carry wall-clock stamps: keep the old overlap for them. */
const LEGACY_OVERLAP_MS = 2000;
/** A lease outlives any real write (socket timeout 15 s); a crashed Worker's lease just expires. */
const WRITE_LEASE_MS = 120_000;

interface Cursor {
  since: number;
  /** High-water mark taken before the first page: the next pull's `since`. */
  t0: number;
  ti: number;
  s?: number | undefined;
  id?: string | undefined;
}

function encodeCursor(c: Cursor): string {
  return b64url(new TextEncoder().encode(JSON.stringify(c)));
}

function decodeCursor(raw: string): Cursor {
  try {
    const c = JSON.parse(new TextDecoder().decode(b64urlDecode(raw))) as Cursor;
    if (
      !Number.isSafeInteger(c.since) ||
      !Number.isSafeInteger(c.t0) ||
      !Number.isSafeInteger(c.ti) ||
      c.ti < 0 ||
      (c.s !== undefined && !Number.isSafeInteger(c.s)) ||
      (c.id !== undefined && (typeof c.id !== 'string' || c.id.length > 64))
    ) {
      throw new Error('bad cursor');
    }
    return c;
  } catch {
    throw badRequest('invalid_cursor');
  }
}

export const syncRoutes = new Hono<AppEnv>();

syncRoutes.use('*', requireUser());
syncRoutes.use('*', async (c, next) => {
  // Backup/sync is for signed-in accounts only (sheet 15); anonymous accounts keep data on device.
  if (c.get('user')?.anonymous) throw forbidden('account_required');
  await rateLimit(c, `sync:${c.get('userId')}`, 120, 60_000);
  await next();
});

syncRoutes.post('/push', async (c) => {
  const body = await readJson(c, SYNC_LIMITS.maxPushBytes);
  const table = body.table;
  if (typeof table !== 'string' || !TABLE_NAMES.includes(table)) throw badRequest('unknown_table');
  if (!Array.isArray(body.rows)) throw badRequest('rows_must_be_array');
  if (body.rows.length > SYNC_LIMITS.maxRowsPerPush) throw badRequest('too_many_rows');
  const deps = c.get('deps');
  const now = deps.now();
  const rejected: { id: string | null; reason: string }[] = [];
  const valid = new Map<string, Record<string, string | number | boolean | null>>();
  for (const input of body.rows) {
    const r = validateRow(table, input, now);
    if (!r.ok) rejected.push({ id: r.id, reason: r.reason });
    else {
      // Duplicate ids in one batch: keep the newest.
      const prev = valid.get(String(r.row.id));
      if (!prev || Number(prev.updated_at) < Number(r.row.updated_at)) valid.set(String(r.row.id), r.row);
    }
  }
  const userId = c.get('userId'); // always the token's user, never anything from the body
  const db = await deps.db();
  let result: { accepted: string[]; conflicts: string[] } = { accepted: [], conflicts: [] };
  if (valid.size > 0) {
    const lease = await db.beginSyncWrite(userId, now, WRITE_LEASE_MS);
    try {
      result = await db.upsertRows(table, userId, [...valid.values()], lease.seq);
    } finally {
      await db.endSyncWrite(userId, lease.leaseId);
    }
  }
  const { accepted, conflicts } = result;
  // If the account was deleted while this request was in flight, remove what we just wrote.
  if (accepted.length > 0 && !(await db.getUser(userId))) {
    await db.deleteUserData(userId);
    return c.json({ error: 'unauthorized' }, 401);
  }
  return c.json({ accepted, conflicts, rejected, serverTime: now });
});

syncRoutes.get('/pull', async (c) => {
  const deps = c.get('deps');
  const now = deps.now();
  const q = c.req.query();
  let tables = TABLE_NAMES;
  if (q.tables) {
    tables = q.tables.split(',').map((t) => t.trim()).filter(Boolean);
    if (tables.length === 0 || tables.some((t) => !TABLE_NAMES.includes(t))) throw badRequest('unknown_table');
    tables = TABLE_NAMES.filter((t) => tables.includes(t)); // stable order
  }
  const limit = q.limit ? Number(q.limit) : SYNC_LIMITS.maxPullPage;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > SYNC_LIMITS.maxPullPage) throw badRequest('invalid_limit');

  let cur: Cursor;
  if (q.cursor) cur = decodeCursor(q.cursor);
  else {
    const since = q.since === undefined || q.since === '' ? 0 : Number(q.since);
    if (!Number.isSafeInteger(since) || since < 0) throw badRequest('invalid_since');
    cur = { since, t0: 0, ti: 0 };
  }

  const db = await deps.db();
  const userId = c.get('userId');
  // Taken before reading any rows: everything stamped at or below it is already committed.
  if (!q.cursor) cur.t0 = await db.syncHighWater(userId, now, LEGACY_OVERLAP_MS);
  const changes: Record<string, Record<string, unknown>[]> = {};
  let remaining = limit;
  let next: Cursor | null = null;
  for (let ti = cur.ti; ti < tables.length; ti++) {
    const table = tables[ti]!;
    const after = ti === cur.ti && cur.s !== undefined && cur.id !== undefined ? { syncedAt: cur.s, id: cur.id } : undefined;
    const rows = await db.pullRows(table, userId, { since: cur.since, after, limit: remaining });
    if (rows.length > 0) changes[table] = rows.map((r) => ({ ...r.data, user_id: userId }));
    remaining -= rows.length;
    if (remaining === 0) {
      const last = rows[rows.length - 1]!;
      next = { since: cur.since, t0: cur.t0, ti, s: last.syncedAt, id: last.id };
      break;
    }
  }
  return c.json({
    changes,
    nextCursor: next ? encodeCursor(next) : null,
    nextSince: cur.t0,
    serverTime: now,
  });
});

