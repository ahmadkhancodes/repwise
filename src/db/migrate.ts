import { migrate } from 'drizzle-orm/expo-sqlite/migrator';

import { getDb } from './client';
import { migrations } from './migrations/migrations';

export { migrations };

/** Run pending migrations (tests, scripts). The app uses useMigrations in DatabaseProvider. */
export async function migrateDb(): Promise<void> {
  await migrate(getDb(), migrations);
}
