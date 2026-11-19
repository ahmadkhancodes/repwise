import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import * as schema from './schema';

export type AppDb = ExpoSQLiteDatabase<typeof schema>;

const DB_NAME = 'repwise.db';

let current: { raw: SQLiteDatabase; db: AppDb } | null = null;

function open() {
  // Change listener on: drizzle's useLiveQuery re-runs when a table it reads is written.
  const raw = openDatabaseSync(DB_NAME, { enableChangeListener: true });
  try {
    raw.execSync('PRAGMA journal_mode = WAL;');
  } catch {
    // WAL is a speed-up only.
  }
  return { raw, db: drizzle(raw, { schema }) };
}

/** The app database (opened lazily on first use; synchronous and local, never the network). */
export function getDb(): AppDb {
  if (!current) current = open();
  return current.db;
}

/** The underlying expo-sqlite handle (raw SQL in tests and diagnostics). */
export function getRawDb(): SQLiteDatabase {
  if (!current) current = open();
  return current.raw;
}

/** Tests only: drop the current connection so the next getDb() starts from an empty database. */
export function resetDbForTests(): void {
  try {
    current?.raw.closeSync();
  } catch {
    // already closed
  }
  current = null;
}
