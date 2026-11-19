import { Hono } from 'hono';
import { requireUser } from '../lib/middleware';
import type { AppEnv } from '../types';

export const accountRoutes = new Hono<AppEnv>();

/**
 * Delete ALL server data for the caller: user, refresh tokens, email codes, entitlements, purchases,
 * AI cache and every synced table. Idempotent: repeating it with the same token returns 204.
 * Store subscriptions are not cancelled (the app shows the store's cancel link first).
 */
accountRoutes.delete('/', requireUser({ allowMissingUser: true }), async (c) => {
  const deps = c.get('deps');
  const db = await deps.db();
  await db.deleteUserData(c.get('userId'), c.get('user')?.email);
  return c.body(null, 204);
});
