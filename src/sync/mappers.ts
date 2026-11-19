/**
 * Local row (drizzle, camelCase keys, parsed JSON) ↔ remote row (server, snake_case SQL names,
 * plain values only: JSON columns travel as JSON text, booleans as 0/1). Derived from the schema,
 * so a new column needs no mapper change — only the server allow-list (see allowlist test).
 */
import { getTableColumns } from 'drizzle-orm';

import { syncTables, type SyncTableName } from '@/db/schema';

export type RemoteValue = string | number | boolean | null;
export type RemoteRow = Record<string, RemoteValue>;
type LocalRow = Record<string, unknown>;

type ColumnInfo = { key: string; sql: string; kind: 'json' | 'bool' | 'plain' };

/** Columns that never leave the device (dirty) or are set by the server from the token (user_id). */
export const NOT_PUSHED = ['dirty', 'user_id'] as const;

const cache = new Map<SyncTableName, ColumnInfo[]>();

export function columnsOf(table: SyncTableName): ColumnInfo[] {
  let cols = cache.get(table);
  if (!cols) {
    cols = Object.entries(getTableColumns(syncTables[table])).map(([key, c]) => ({
      key,
      sql: c.name,
      kind: c.columnType === 'SQLiteTextJson' ? 'json' : c.columnType === 'SQLiteBoolean' ? 'bool' : 'plain',
    }));
    cache.set(table, cols);
  }
  return cols;
}

/** SQL column names sent to /sync/push (must equal server COMMON_COLUMNS + SYNC_TABLES[table]). */
export function pushedColumnNames(table: SyncTableName): string[] {
  return columnsOf(table)
    .map((c) => c.sql)
    .filter((n) => !(NOT_PUSHED as readonly string[]).includes(n));
}

export function toRemote(table: SyncTableName, row: LocalRow): RemoteRow {
  const out: RemoteRow = {};
  for (const c of columnsOf(table)) {
    if ((NOT_PUSHED as readonly string[]).includes(c.sql)) continue;
    const v = row[c.key];
    if (v === undefined || v === null) out[c.sql] = null;
    else if (c.kind === 'json') out[c.sql] = JSON.stringify(v);
    else if (c.kind === 'bool') out[c.sql] = v ? 1 : 0;
    else out[c.sql] = v as RemoteValue;
  }
  return out;
}

function isMs(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
}

/**
 * Remote → local row ready to upsert (clean, owned by `userId`). Unknown fields are ignored
 * (a newer app version may have added columns); malformed rows return null and are skipped.
 */
export function fromRemote(table: SyncTableName, remote: unknown, userId: string): LocalRow | null {
  if (typeof remote !== 'object' || remote === null) return null;
  const r = remote as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id || !isMs(r.updated_at) || !isMs(r.created_at)) return null;
  const out: LocalRow = {};
  for (const c of columnsOf(table)) {
    if (c.sql === 'dirty') out[c.key] = 0;
    else if (c.sql === 'user_id') out[c.key] = userId;
    else {
      const v = r[c.sql];
      if (v === undefined || v === null) out[c.key] = null;
      else if (c.kind === 'json') {
        try {
          out[c.key] = typeof v === 'string' ? JSON.parse(v) : null;
        } catch {
          out[c.key] = null;
        }
      } else if (c.kind === 'bool') out[c.key] = v === true || v === 1 || v === '1';
      else out[c.key] = v;
    }
  }
  return out;
}
