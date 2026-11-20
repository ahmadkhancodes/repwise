import { describe, expect, it } from 'vitest';
import { getMongoClient, MongoDb, resetMongoClientCache, type MongoClientLike } from '../src/db/mongo';
import { MemoryDb } from '../src/db/memory';
import type { Db } from '../src/db/types';

describe('Mongo client cache (per isolate)', () => {
  it('reuses one client and drops the cached promise after a failed connect', async () => {
    resetMongoClientCache();
    let attempts = 0;
    const client: MongoClientLike = { connect: async () => undefined, db: () => ({ collection: () => ({}) as never }) };
    const loader = async () => ({
      MongoClient: class {
        constructor() {
          attempts++;
        }
        async connect() {
          if (attempts === 1) throw new Error('network');
        }
        db = client.db;
      } as never,
    });
    await expect(getMongoClient('mongodb://x', loader)).rejects.toThrow('network');
    await new Promise((r) => setTimeout(r, 0));
    const a = await getMongoClient('mongodb://x', loader);
    const b = await getMongoClient('mongodb://x', loader);
    expect(a).toBe(b);
    expect(attempts).toBe(2);
    resetMongoClientCache();
  });

  it('keeps the literal mongodb import so wrangler bundles the driver', async () => {
    const { readFileSync } = await import('node:fs' as string);
    const src: string = readFileSync(new URL('../src/db/mongo.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/import\('mongodb' as string\)/);
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/import\(\s*(?!'mongodb')[a-zA-Z_$]/);
  });
});

/** Behaviour every Db implementation must share. Runs on Mongo too when MONGODB_TEST_URI is set. */
function contract(name: string, make: () => Promise<Db>) {
  describe(`Db contract: ${name}`, () => {
    it('users, refresh tokens, rate limits', async () => {
      const db = await make();
      const id = `u-${crypto.randomUUID()}`;
      const email = `${id}@example.com`;
      await db.createUser({ _id: id, email, anonymous: false, createdAt: 1, lastSeenAt: 1 });
      expect((await db.findUserBy('email', email))?._id).toBe(id);
      await expect(db.createUser({ _id: `${id}-2`, email, anonymous: false, createdAt: 1, lastSeenAt: 1 })).rejects.toThrow();
      const now = Date.now();
      await db.insertRefreshToken({ _id: `rt-${id}`, userId: id, tokenHash: `h-${id}`, familyId: `f-${id}`, createdAt: now, expiresAt: now + 600_000 });
      expect((await db.consumeRefreshToken(`h-${id}`, now)).status).toBe('ok');
      expect((await db.consumeRefreshToken(`h-${id}`, now)).status).toBe('reused');
      expect((await db.consumeRefreshToken(`h-${id}`, now + 30_000, 60_000)).status).toBe('grace');
      expect((await db.consumeRefreshToken(`h-${id}`, now + 61_000, 60_000)).status).toBe('reused');
      expect((await db.getRefreshToken(`h-${id}`))?.familyId).toBe(`f-${id}`);
      // Late lost-response recovery claims an unused token once; a rotated one never.
      expect(await db.markRefreshTokenRecovered(`h-${id}`, now)).toBe(false);
      await db.insertRefreshToken({ _id: `rt3-${id}`, userId: id, tokenHash: `h3-${id}`, familyId: `f-${id}`, createdAt: now, expiresAt: now + 600_000 });
      expect(await db.markRefreshTokenRecovered(`h3-${id}`, now)).toBe(true);
      expect(await db.markRefreshTokenRecovered(`h3-${id}`, now)).toBe(false);
      expect((await db.getRefreshToken(`h3-${id}`))?.recoveredAt).toBe(now);
      await expect(db.insertRefreshToken({ _id: `rt2-${id}`, userId: id, tokenHash: `h-${id}`, familyId: `f-${id}`, createdAt: now, expiresAt: now + 60_000 })).rejects.toThrow();
      // Email codes: check-and-count is one step and stops at the cap.
      await db.putEmailCode({ _id: `ec-${id}`, email, codeHash: 'h', attempts: 0, createdAt: now, expiresAt: now + 60_000 });
      for (let i = 1; i <= 2; i++) expect((await db.claimEmailCodeAttempt(email, now, 2))?.attempts).toBe(i);
      expect(await db.claimEmailCodeAttempt(email, now, 2)).toBeNull();
      expect(await db.consumeEmailCode(`ec-${id}`)).toBe(true);
      expect(await db.consumeEmailCode(`ec-${id}`)).toBe(false);
      // AI spend reservations never cross the cap.
      const month = `m-${id}`;
      expect(await db.reserveAiSpend(month, 40, 100, now)).toBe(true);
      expect(await db.reserveAiSpend(month, 40, 100, now)).toBe(true);
      expect(await db.reserveAiSpend(month, 40, 100, now)).toBe(false);
      await db.addAiSpend(month, { usdMicros: -50 }, now);
      expect((await db.getAiSpend(month))?.usdMicros).toBe(30);
      expect(await db.hit(`k-${id}`, 60_000, now)).toBe(1);
      expect(await db.hit(`k-${id}`, 60_000, now)).toBe(2);
      await db.deleteUserData(id);
      expect(await db.getUser(id)).toBeNull();
    });

    it('sync rows: last-write-wins and paging', async () => {
      const db = await make();
      const uid = `u-${crypto.randomUUID()}`;
      const r = (id: string, u: number) => ({ id, created_at: 1, updated_at: u, deleted_at: null });
      expect(await db.upsertRows('cards', uid, [r('a', 10), r('b', 10)], 100)).toEqual({ accepted: ['a', 'b'], conflicts: [] });
      expect(await db.upsertRows('cards', uid, [r('a', 5), r('b', 20)], 200)).toEqual({ accepted: ['b'], conflicts: ['a'] });
      const page1 = await db.pullRows('cards', uid, { since: 0, limit: 1 });
      expect(page1.map((x) => x.id)).toEqual(['a']);
      const page2 = await db.pullRows('cards', uid, { since: 0, limit: 5, after: { syncedAt: page1[0]!.syncedAt, id: 'a' } });
      expect(page2.map((x) => [x.id, x.data.updated_at])).toEqual([['b', 20]]);
      expect(await db.pullRows('cards', `${uid}-other`, { since: 0, limit: 5 })).toEqual([]);
      // Write leases cap the high-water mark until the write ends; stamps never go backwards.
      const w1 = await db.beginSyncWrite(uid, 1_000, 60_000);
      const w2 = await db.beginSyncWrite(uid, 500, 60_000);
      expect(w2.seq).toBeGreaterThan(w1.seq);
      expect(await db.syncHighWater(uid, 1_000, 2_000)).toBeLessThan(w1.seq);
      await db.endSyncWrite(uid, w1.leaseId);
      await db.endSyncWrite(uid, w2.leaseId);
      expect(await db.syncHighWater(uid, 1_000, 2_000)).toBe(w2.seq);
      await db.deleteUserData(uid);
      expect(await db.pullRows('cards', uid, { since: 0, limit: 5 })).toEqual([]);
    });
  });
}

contract('memory', async () => new MemoryDb());
const uri = process.env.MONGODB_TEST_URI;
if (uri) contract('mongodb', () => MongoDb.connect(uri, `repwise_test`));
