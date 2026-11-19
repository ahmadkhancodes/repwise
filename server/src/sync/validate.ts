import type { SyncRow, SyncValue } from '../db/types';
import { isPlainObject } from '../lib/http';
import { COMMON_COLUMNS, STRIPPED_COLUMNS, SYNC_LIMITS, SYNC_TABLES } from './tables';

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const enc = new TextEncoder();

export type RowResult = { ok: true; row: SyncRow } | { ok: false; id: string | null; reason: string };

function isMs(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
}

/** Validate one pushed row: plain values only, allow-listed field names, size caps, sane timestamps. */
export function validateRow(table: string, input: unknown, now: number): RowResult {
  const allowed = SYNC_TABLES[table];
  if (!allowed) return { ok: false, id: null, reason: 'unknown_table' };
  if (!isPlainObject(input)) return { ok: false, id: null, reason: 'not_an_object' };
  const id = typeof input.id === 'string' && ID_RE.test(input.id) ? input.id : null;
  if (!id) return { ok: false, id: null, reason: 'invalid_id' };
  const fail = (reason: string): RowResult => ({ ok: false, id, reason });

  const row: SyncRow = {};
  let bytes = 0;
  for (const [k, v] of Object.entries(input)) {
    if ((STRIPPED_COLUMNS as readonly string[]).includes(k)) continue;
    if (!(COMMON_COLUMNS as readonly string[]).includes(k) && !allowed.includes(k)) return fail(`unknown_field:${k.slice(0, 64)}`);
    if (!(v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)))) {
      return fail(`invalid_value:${k}`);
    }
    if (typeof v === 'string') {
      const n = enc.encode(v).byteLength;
      if (n > SYNC_LIMITS.maxStringBytes) return fail(`value_too_large:${k}`);
      bytes += n;
    } else bytes += 8;
    bytes += k.length;
    row[k] = v as SyncValue;
  }
  if (bytes > SYNC_LIMITS.maxRowBytes) return fail('row_too_large');
  if (!isMs(row.created_at)) return fail('invalid_created_at');
  if (!isMs(row.updated_at)) return fail('invalid_updated_at');
  if (row.updated_at > now + SYNC_LIMITS.maxFutureSkewMs) return fail('updated_at_in_future');
  if (row.deleted_at === undefined) row.deleted_at = null;
  if (row.deleted_at !== null && !isMs(row.deleted_at)) return fail('invalid_deleted_at');
  return { ok: true, row };
}
