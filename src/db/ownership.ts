import { isNull } from 'drizzle-orm';

import { getDb } from './client';
import { DIRTY } from './repo';
import { cards, SYNC_TABLE_NAMES, syncTables } from './schema';

type AnyTable = typeof cards;
const tables = () => SYNC_TABLE_NAMES.map((n) => syncTables[n] as unknown as AnyTable);

/** On sign-in: rows created while signed out or anonymous now belong to the account. */
export function attachLocalRows(userId: string): void {
  const db = getDb();
  db.transaction((tx) => {
    for (const t of tables()) tx.update(t).set({ userId }).where(isNull(t.userId)).run();
  });
}

/**
 * On sign-out / account deletion: rows stay on the phone (never lose data) but no longer belong
 * to any account. They are marked dirty so a later sign-in backs them up again.
 */
export function detachLocalRows(): void {
  const db = getDb();
  db.transaction((tx) => {
    for (const t of tables()) tx.update(t).set({ userId: null, dirty: DIRTY.pending }).run();
  });
}
