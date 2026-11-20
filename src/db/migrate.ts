import { migrate } from 'drizzle-orm/expo-sqlite/migrator';

import { getDb, getRawDb } from './client';
import { migrations } from './migrations/migrations';

export { migrations };

/** Run pending migrations (tests, scripts, and DatabaseProvider when the schema is behind). */
export async function migrateDb(): Promise<void> {
  await migrate(getDb(), migrations);
}

/**
 * True when the database already has every bundled migration: the same check drizzle's migrator
 * makes (newest `__drizzle_migrations.created_at` ≥ newest journal `when`), but synchronous, so
 * a normal launch renders the first screen without waiting on the async migrator (perf audit A7).
 * Any error (fresh install: no table yet) → false, and the migrator runs as before.
 */
export function isSchemaCurrent(): boolean {
  const last = migrations.journal.entries[migrations.journal.entries.length - 1];
  if (!last) return true;
  try {
    const row = getRawDb().getFirstSync(
      'SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1',
    ) as { created_at: number | string | null } | null;
    return row?.created_at != null && Number(row.created_at) >= last.when;
  } catch {
    return false;
  }
}
