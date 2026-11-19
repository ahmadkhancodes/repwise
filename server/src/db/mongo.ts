import { uuidv7 } from '../lib/crypto';
import { TABLE_NAMES } from '../sync/tables';
import type {
  AiCacheDoc,
  AiSpendDoc,
  AiUsageDelta,
  ConsumeRefreshResult,
  Db,
  EmailCodeDoc,
  EntitlementDoc,
  PullOptions,
  PurchaseDoc,
  RefreshTokenDoc,
  StoredRow,
  SyncRow,
  SyncWriteLease,
  UserDoc,
} from './types';
import { DuplicateKeyError } from './types';

/* Minimal structural types for the parts of the MongoDB driver we use. The driver is loaded with a
 * literal dynamic import so wrangler bundles it, while keeping its Node-only typings out of tsc. */
type Doc = Record<string, any>;
interface Cursor {
  sort(s: Doc): Cursor;
  limit(n: number): Cursor;
  project(p: Doc): Cursor;
  toArray(): Promise<Doc[]>;
}
interface Coll {
  findOne(filter: Doc, opts?: Doc): Promise<Doc | null>;
  find(filter: Doc, opts?: Doc): Cursor;
  insertOne(doc: Doc): Promise<unknown>;
  updateOne(filter: Doc, update: Doc, opts?: Doc): Promise<unknown>;
  updateMany(filter: Doc, update: Doc): Promise<unknown>;
  replaceOne(filter: Doc, doc: Doc, opts?: Doc): Promise<unknown>;
  /** `update` may be an aggregation pipeline (array of stages). */
  findOneAndUpdate(filter: Doc, update: Doc | Doc[], opts?: Doc): Promise<Doc | null>;
  deleteOne(filter: Doc): Promise<{ deletedCount?: number } | unknown>;
  deleteMany(filter: Doc): Promise<unknown>;
  bulkWrite(ops: Doc[], opts?: Doc): Promise<unknown>;
  createIndex(spec: Doc, opts?: Doc): Promise<unknown>;
}
interface MongoDatabase {
  collection(name: string): Coll;
}
export interface MongoClientLike {
  connect(): Promise<unknown>;
  db(name?: string): MongoDatabase;
  close?(): Promise<unknown>;
}
export type MongoModuleLoader = () => Promise<{ MongoClient: new (uri: string, opts: Doc) => MongoClientLike }>;

// LITERAL specifier: wrangler/esbuild only bundles imports it can see. Never `import(variable)`.
const loadDriver: MongoModuleLoader = () => import('mongodb' as string);

let cached: { uri: string; promise: Promise<MongoClientLike> } | null = null;

/** One client per isolate. A failed connect drops the cached promise so the next request retries. */
export function getMongoClient(uri: string, loader: MongoModuleLoader = loadDriver): Promise<MongoClientLike> {
  if (cached && cached.uri === uri) return cached.promise;
  const promise = (async () => {
    const { MongoClient } = await loader();
    const client = new MongoClient(uri, {
      maxPoolSize: 5,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 15000,
      retryWrites: true,
    });
    await client.connect();
    return client;
  })();
  const entry = { uri, promise };
  cached = entry;
  promise.catch(() => {
    if (cached === entry) cached = null;
  });
  return promise;
}

/** Test hook. */
export function resetMongoClientCache(): void {
  cached = null;
}

const INDEX_VERSION = 2;
let indexesReady: Promise<void> | null = null;

const isDup = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: number }).code === 11000;
const toDate = (ms: number) => new Date(ms);
const toMs = (v: unknown): number => (v instanceof Date ? v.getTime() : Number(v));
const normToken = (d: Doc): RefreshTokenDoc => ({ ...(d as RefreshTokenDoc), expiresAt: toMs(d.expiresAt) });
function compact<T extends Doc>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

export class MongoDb implements Db {
  private constructor(private readonly db: MongoDatabase) {}

  static async connect(uri: string, dbName: string, loader?: MongoModuleLoader): Promise<MongoDb> {
    const client = await getMongoClient(uri, loader);
    const m = new MongoDb(client.db(dbName));
    if (!indexesReady) {
      indexesReady = m.ensureIndexes();
      indexesReady.catch(() => (indexesReady = null));
    }
    await indexesReady;
    return m;
  }

  private c(name: string): Coll {
    return this.db.collection(name);
  }

  /** Create indexes once per database (version flag in `_meta`), not on every cold start. */
  private async ensureIndexes(): Promise<void> {
    const meta = await this.c('_meta').findOne({ _id: 'indexes' });
    if (meta && meta.v === INDEX_VERSION) return;
    const str = (f: string) => ({ partialFilterExpression: { [f]: { $type: 'string' } }, unique: true });
    await Promise.all([
      this.c('users').createIndex({ email: 1 }, str('email')),
      this.c('users').createIndex({ googleSub: 1 }, str('googleSub')),
      this.c('users').createIndex({ appleSub: 1 }, str('appleSub')),
      this.c('refresh_tokens').createIndex({ tokenHash: 1 }, { unique: true }),
      this.c('refresh_tokens').createIndex({ userId: 1 }),
      this.c('refresh_tokens').createIndex({ familyId: 1 }),
      this.c('refresh_tokens').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      this.c('email_codes').createIndex({ email: 1 }),
      this.c('email_codes').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      this.c('rate_limits').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      this.c('sync_leases').createIndex({ userId: 1, floor: 1 }),
      this.c('sync_leases').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      this.c('purchases').createIndex({ userId: 1 }),
      this.c('ai_cache').createIndex({ userId: 1 }),
      this.c('ai_cache').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      ...TABLE_NAMES.map((t) => this.c(t).createIndex({ userId: 1, syncedAt: 1, _id: 1 })),
    ]);
    await this.c('_meta').replaceOne({ _id: 'indexes' }, { _id: 'indexes', v: INDEX_VERSION }, { upsert: true });
  }

  // users
  async getUser(id: string) {
    return (await this.c('users').findOne({ _id: id })) as UserDoc | null;
  }
  async findUserBy(field: 'email' | 'googleSub' | 'appleSub', value: string) {
    return (await this.c('users').findOne({ [field]: value })) as UserDoc | null;
  }
  async createUser(user: UserDoc) {
    try {
      await this.c('users').insertOne(compact({ ...user }));
    } catch (e) {
      if (isDup(e)) throw new DuplicateKeyError('duplicate user');
      throw e;
    }
  }
  async updateUser(id: string, patch: Partial<Omit<UserDoc, '_id'>>) {
    try {
      await this.c('users').updateOne({ _id: id }, { $set: compact({ ...patch }) });
    } catch (e) {
      if (isDup(e)) throw new DuplicateKeyError('duplicate user field');
      throw e;
    }
  }

  // refresh tokens
  async insertRefreshToken(t: RefreshTokenDoc) {
    try {
      await this.c('refresh_tokens').insertOne({ ...t, expiresAt: toDate(t.expiresAt), rotatedAt: t.rotatedAt ?? null });
    } catch (e) {
      if (isDup(e)) throw new DuplicateKeyError('duplicate token');
      throw e;
    }
  }
  async consumeRefreshToken(tokenHash: string, now: number, graceMs = 0): Promise<ConsumeRefreshResult> {
    const coll = this.c('refresh_tokens');
    const doc = await coll.findOneAndUpdate(
      { tokenHash, rotatedAt: null, expiresAt: { $gt: toDate(now) } },
      { $set: { rotatedAt: now } },
      { returnDocument: 'before' },
    );
    if (doc) return { status: 'ok', token: normToken(doc) };
    const prev = await coll.findOne({ tokenHash });
    if (prev && prev.rotatedAt && toMs(prev.expiresAt) > now) {
      return { status: graceMs > 0 && now - Number(prev.rotatedAt) <= graceMs ? 'grace' : 'reused', token: normToken(prev) };
    }
    return { status: 'missing' };
  }
  async getRefreshToken(tokenHash: string) {
    const d = await this.c('refresh_tokens').findOne({ tokenHash });
    return d ? normToken(d) : null;
  }
  async revokeRefreshFamily(familyId: string) {
    await this.c('refresh_tokens').deleteMany({ familyId });
  }

  // email codes
  async putEmailCode(doc: EmailCodeDoc) {
    await this.deleteEmailCodes(doc.email);
    await this.c('email_codes').insertOne({ ...doc, expiresAt: toDate(doc.expiresAt) });
  }
  async getEmailCode(email: string, now: number) {
    const d = await this.c('email_codes').findOne({ email, expiresAt: { $gt: toDate(now) } }, { sort: { createdAt: -1 } });
    return d ? ({ ...(d as EmailCodeDoc), expiresAt: toMs(d.expiresAt) } as EmailCodeDoc) : null;
  }
  async claimEmailCodeAttempt(email: string, now: number, maxAttempts: number) {
    // Only the newest live code counts (putEmailCode keeps one per email). One atomic operation:
    // the filter checks the attempt count and the update increments it.
    const newest = await this.c('email_codes').findOne({ email, expiresAt: { $gt: toDate(now) } }, { sort: { createdAt: -1 } });
    if (!newest) return null;
    const d = await this.c('email_codes').findOneAndUpdate(
      { _id: newest._id, expiresAt: { $gt: toDate(now) }, attempts: { $lt: maxAttempts } },
      { $inc: { attempts: 1 } },
      { returnDocument: 'after' },
    );
    return d ? ({ ...(d as EmailCodeDoc), expiresAt: toMs(d.expiresAt) } as EmailCodeDoc) : null;
  }
  async consumeEmailCode(id: string) {
    const r = (await this.c('email_codes').deleteOne({ _id: id })) as { deletedCount?: number };
    return (r?.deletedCount ?? 0) === 1;
  }
  async deleteEmailCodes(email: string) {
    await this.c('email_codes').deleteMany({ email });
  }

  // rate limits
  async hit(key: string, windowMs: number, now: number) {
    const w = Math.floor(now / windowMs);
    const run = () =>
      this.c('rate_limits').findOneAndUpdate(
        { _id: `${key}:${w}` },
        { $inc: { n: 1 }, $setOnInsert: { expiresAt: toDate((w + 1) * windowMs) } },
        { upsert: true, returnDocument: 'after' },
      );
    let doc: Doc | null;
    try {
      doc = await run();
    } catch (e) {
      if (!isDup(e)) throw e;
      doc = await run(); // concurrent upsert race
    }
    return Number(doc?.n ?? 1);
  }

  // sync
  async beginSyncWrite(userId: string, now: number, leaseMs: number): Promise<SyncWriteLease> {
    // 1. Floor = the stamp before ours. 2. Publish the lease. 3. Allocate. Steps 2 → 3 order is what
    // lets syncHighWater() cap every pull below a stamp that is allocated but not yet committed.
    const prev = await this.c('sync_seq').findOne({ _id: userId });
    const floor = prev ? Number(prev.seq) : now - 1;
    const leaseId = uuidv7(now);
    await this.c('sync_leases').insertOne({ _id: leaseId, userId, floor, expiresAt: toDate(now + leaseMs) });
    const run = () =>
      this.c('sync_seq').findOneAndUpdate(
        { _id: userId },
        [{ $set: { seq: { $max: [{ $add: [{ $ifNull: ['$seq', 0] }, 1] }, now] } } }],
        { upsert: true, returnDocument: 'after' },
      );
    let d: Doc | null;
    try {
      d = await run();
    } catch (e) {
      if (!isDup(e)) throw e;
      d = await run(); // concurrent first upsert
    }
    return { seq: Number(d?.seq), leaseId };
  }
  async endSyncWrite(_userId: string, leaseId: string) {
    await this.c('sync_leases').deleteOne({ _id: leaseId });
  }
  async syncHighWater(userId: string, now: number, legacyOverlapMs: number) {
    // Read the counter BEFORE the leases: a write allocated after this read gets a higher stamp.
    const seqDoc = await this.c('sync_seq').findOne({ _id: userId });
    let hw = seqDoc ? Number(seqDoc.seq) : now - legacyOverlapMs;
    const [oldest] = await this.c('sync_leases')
      .find({ userId, expiresAt: { $gt: toDate(now) } })
      .sort({ floor: 1 })
      .limit(1)
      .toArray();
    if (oldest) hw = Math.min(hw, Number(oldest.floor));
    return Math.max(0, hw);
  }
  async upsertRows(table: string, userId: string, rows: SyncRow[], syncedAt: number) {
    if (rows.length === 0) return { accepted: [], conflicts: [] };
    const ops = rows.map((row) => ({
      updateOne: {
        filter: { _id: `${userId}:${row.id}`, updated_at: { $lt: row.updated_at } },
        update: { $set: { ...row, userId, syncedAt } },
        upsert: true,
      },
    }));
    const failed = new Set<number>();
    try {
      await this.c(table).bulkWrite(ops, { ordered: false });
    } catch (e) {
      const raw = (e as { writeErrors?: unknown }).writeErrors;
      const errs = (Array.isArray(raw) ? raw : raw ? [raw] : []) as { index: number; code: number }[];
      if (errs.length === 0 || errs.some((w) => w.code !== 11000)) throw e;
      // 11000 = the row exists with an equal or newer updated_at: last-write-wins keeps the server copy.
      for (const w of errs) failed.add(w.index);
    }
    const accepted: string[] = [];
    const conflicts: string[] = [];
    rows.forEach((r, i) => (failed.has(i) ? conflicts : accepted).push(String(r.id)));
    return { accepted, conflicts };
  }
  async pullRows(table: string, userId: string, opts: PullOptions): Promise<StoredRow[]> {
    const filter: Doc = { userId, syncedAt: { $gt: opts.since } };
    if (opts.after) {
      filter.$or = [
        { syncedAt: { $gt: opts.after.syncedAt } },
        { syncedAt: opts.after.syncedAt, _id: { $gt: `${userId}:${opts.after.id}` } },
      ];
    }
    const docs = await this.c(table).find(filter).sort({ syncedAt: 1, _id: 1 }).limit(opts.limit).toArray();
    return docs.map((d) => {
      const { _id, userId: _u, syncedAt, ...data } = d;
      return { id: String(data.id), syncedAt: Number(syncedAt), data: data as SyncRow };
    });
  }

  // billing
  async getPurchase(id: string) {
    return (await this.c('purchases').findOne({ _id: id })) as PurchaseDoc | null;
  }
  async putPurchase(p: PurchaseDoc) {
    await this.c('purchases').replaceOne({ _id: p._id }, p, { upsert: true });
  }
  async listPurchases(userId: string) {
    return (await this.c('purchases').find({ userId }).toArray()) as PurchaseDoc[];
  }
  async getEntitlement(userId: string) {
    return (await this.c('entitlements').findOne({ _id: userId })) as EntitlementDoc | null;
  }
  async putEntitlement(e: EntitlementDoc) {
    await this.c('entitlements').replaceOne({ _id: e._id }, e, { upsert: true });
  }

  // AI
  async getAiCache(key: string, now: number) {
    const d = await this.c('ai_cache').findOne({ _id: key, expiresAt: { $gt: toDate(now) } });
    return d ? ({ ...(d as AiCacheDoc), expiresAt: toMs(d.expiresAt) } as AiCacheDoc) : null;
  }
  async putAiCache(doc: AiCacheDoc) {
    await this.c('ai_cache').replaceOne({ _id: doc._id }, { ...doc, expiresAt: toDate(doc.expiresAt) }, { upsert: true });
  }
  async reserveAiSpend(month: string, micros: number, capMicros: number, now: number) {
    if (micros >= capMicros) return false;
    // Conditional $inc: the filter only matches while the reservation keeps the month under the cap.
    const run = (upsert: boolean) =>
      this.c('ai_spend').findOneAndUpdate(
        { _id: month, $or: [{ usdMicros: { $lt: capMicros - micros } }, { usdMicros: { $exists: false } }] },
        { $inc: { usdMicros: micros }, $set: { updatedAt: now } },
        { upsert, returnDocument: 'after' },
      );
    try {
      return (await run(true)) !== null;
    } catch (e) {
      // Duplicate _id: the month exists but is at/over the cap (or a concurrent first insert won).
      if (!isDup(e)) throw e;
      return (await run(false)) !== null;
    }
  }
  async addAiSpend(month: string, delta: Partial<AiUsageDelta>, now: number) {
    const run = () =>
      this.c('ai_spend').findOneAndUpdate(
        { _id: month },
        { $inc: { ...delta }, $set: { updatedAt: now } },
        { upsert: true, returnDocument: 'after' },
      );
    let d: Doc | null;
    try {
      d = await run();
    } catch (e) {
      if (!isDup(e)) throw e;
      d = await run();
    }
    return d as AiSpendDoc;
  }
  async getAiSpend(month: string) {
    return (await this.c('ai_spend').findOne({ _id: month })) as AiSpendDoc | null;
  }

  // account
  async mergeAnonymousUser(fromUserId: string, toUserId: string) {
    await this.c('purchases').updateMany({ userId: fromUserId }, { $set: { userId: toUserId } });
    await this.deleteUserData(fromUserId);
  }
  async deleteUserData(userId: string, email?: string) {
    const user = await this.getUser(userId);
    const mail = email ?? user?.email;
    await Promise.all([
      this.c('refresh_tokens').deleteMany({ userId }),
      mail ? this.c('email_codes').deleteMany({ email: mail }) : Promise.resolve(),
      this.c('purchases').deleteMany({ userId }),
      this.c('entitlements').deleteOne({ _id: userId }),
      this.c('ai_cache').deleteMany({ userId }),
      this.c('sync_seq').deleteOne({ _id: userId }),
      this.c('sync_leases').deleteMany({ userId }),
      ...TABLE_NAMES.map((t) => this.c(t).deleteMany({ userId })),
    ]);
    // The user document goes last, so a retry after a partial failure still finds the email.
    await this.c('users').deleteOne({ _id: userId });
  }
}
