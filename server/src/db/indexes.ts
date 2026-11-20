import { TABLE_NAMES } from '../sync/tables';

/**
 * Every MongoDB index the API relies on. One list, used by `MongoDb.ensureIndexes` (lazily, once
 * per database version) and by `scripts/create-indexes.ts` (explicitly, before the first deploy).
 * `createIndex` with an identical spec is a no-op, so applying this list is idempotent.
 * Bump INDEX_VERSION whenever the list changes.
 */
export const INDEX_VERSION = 2;

export interface IndexSpec {
  collection: string;
  key: Record<string, 1 | -1>;
  options?: Record<string, unknown>;
}

/** Unique, but only among documents where the field is a string (users without it don't collide). */
const uniqueString = (f: string) => ({ partialFilterExpression: { [f]: { $type: 'string' } }, unique: true });
const ttl = { expireAfterSeconds: 0 };

export const INDEXES: IndexSpec[] = [
  { collection: 'users', key: { email: 1 }, options: uniqueString('email') },
  { collection: 'users', key: { googleSub: 1 }, options: uniqueString('googleSub') },
  { collection: 'users', key: { appleSub: 1 }, options: uniqueString('appleSub') },
  { collection: 'refresh_tokens', key: { tokenHash: 1 }, options: { unique: true } },
  { collection: 'refresh_tokens', key: { userId: 1 } },
  { collection: 'refresh_tokens', key: { familyId: 1 } },
  { collection: 'refresh_tokens', key: { expiresAt: 1 }, options: ttl },
  { collection: 'email_codes', key: { email: 1 } },
  { collection: 'email_codes', key: { expiresAt: 1 }, options: ttl },
  { collection: 'rate_limits', key: { expiresAt: 1 }, options: ttl },
  { collection: 'sync_leases', key: { userId: 1, floor: 1 } },
  { collection: 'sync_leases', key: { expiresAt: 1 }, options: ttl },
  { collection: 'purchases', key: { userId: 1 } },
  { collection: 'ai_cache', key: { userId: 1 } },
  { collection: 'ai_cache', key: { expiresAt: 1 }, options: ttl },
  ...TABLE_NAMES.map((t): IndexSpec => ({ collection: t, key: { userId: 1, syncedAt: 1, _id: 1 } })),
];
