import type {
  AiCacheDoc,
  AiSpendDoc,
  AiUsageDelta,
  Db,
  EmailCodeDoc,
  EntitlementDoc,
  PullOptions,
  PurchaseDoc,
  RefreshTokenDoc,
  StoredRow,
  SyncRow,
  UserDoc,
} from './types';
import { DuplicateKeyError } from './types';

const clone = <T>(v: T): T => structuredClone(v);

/** In-memory Db for tests and local experiments. Same semantics as the MongoDB implementation. */
export class MemoryDb implements Db {
  users = new Map<string, UserDoc>();
  refreshTokens = new Map<string, RefreshTokenDoc>();
  emailCodes = new Map<string, EmailCodeDoc>();
  counters = new Map<string, { n: number; expiresAt: number }>();
  tables = new Map<string, Map<string, StoredRow & { userId: string }>>();
  purchases = new Map<string, PurchaseDoc>();
  entitlements = new Map<string, EntitlementDoc>();
  aiCache = new Map<string, AiCacheDoc>();
  aiSpend = new Map<string, AiSpendDoc>();

  async getUser(id: string) {
    const u = this.users.get(id);
    return u ? clone(u) : null;
  }
  async findUserBy(field: 'email' | 'googleSub' | 'appleSub', value: string) {
    for (const u of this.users.values()) if (u[field] === value) return clone(u);
    return null;
  }
  async createUser(user: UserDoc) {
    if (this.users.has(user._id)) throw new DuplicateKeyError('user exists');
    for (const f of ['email', 'googleSub', 'appleSub'] as const) {
      if (user[f] && (await this.findUserBy(f, user[f]))) throw new DuplicateKeyError(`duplicate ${f}`);
    }
    this.users.set(user._id, clone(user));
  }
  async updateUser(id: string, patch: Partial<Omit<UserDoc, '_id'>>) {
    const u = this.users.get(id);
    if (!u) return;
    for (const f of ['email', 'googleSub', 'appleSub'] as const) {
      const v = patch[f];
      if (v) {
        const other = await this.findUserBy(f, v);
        if (other && other._id !== id) throw new DuplicateKeyError(`duplicate ${f}`);
      }
    }
    this.users.set(id, { ...u, ...clone(patch) });
  }

  async insertRefreshToken(t: RefreshTokenDoc) {
    this.refreshTokens.set(t._id, clone(t));
  }
  async consumeRefreshToken(tokenHash: string, now: number) {
    for (const t of this.refreshTokens.values()) {
      if (t.tokenHash !== tokenHash) continue;
      if (t.expiresAt <= now) return { status: 'missing' as const };
      if (t.rotatedAt) return { status: 'reused' as const, token: clone(t) };
      t.rotatedAt = now;
      return { status: 'ok' as const, token: clone(t) };
    }
    return { status: 'missing' as const };
  }
  async revokeRefreshFamily(familyId: string) {
    for (const [k, t] of this.refreshTokens) if (t.familyId === familyId) this.refreshTokens.delete(k);
  }

  async putEmailCode(doc: EmailCodeDoc) {
    await this.deleteEmailCodes(doc.email);
    this.emailCodes.set(doc._id, clone(doc));
  }
  async getEmailCode(email: string, now: number) {
    for (const d of this.emailCodes.values()) if (d.email === email && d.expiresAt > now) return clone(d);
    return null;
  }
  async incrementEmailCodeAttempts(id: string) {
    const d = this.emailCodes.get(id);
    if (d) d.attempts++;
  }
  async deleteEmailCodes(email: string) {
    for (const [k, d] of this.emailCodes) if (d.email === email) this.emailCodes.delete(k);
  }

  async hit(key: string, windowMs: number, now: number) {
    const k = `${key}:${Math.floor(now / windowMs)}`;
    const cur = this.counters.get(k);
    const n = cur && cur.expiresAt > now ? cur.n + 1 : 1;
    this.counters.set(k, { n, expiresAt: (Math.floor(now / windowMs) + 1) * windowMs });
    return n;
  }

  private table(name: string) {
    let t = this.tables.get(name);
    if (!t) this.tables.set(name, (t = new Map()));
    return t;
  }
  async upsertRows(table: string, userId: string, rows: SyncRow[], now: number) {
    const t = this.table(table);
    const accepted: string[] = [];
    const conflicts: string[] = [];
    for (const row of rows) {
      const id = String(row.id);
      const key = `${userId}:${id}`;
      const existing = t.get(key);
      if (existing && Number(existing.data.updated_at) >= Number(row.updated_at)) {
        conflicts.push(id);
        continue;
      }
      t.set(key, { id, userId, syncedAt: now, data: clone(row) });
      accepted.push(id);
    }
    return { accepted, conflicts };
  }
  async pullRows(table: string, userId: string, opts: PullOptions) {
    const rows = [...this.table(table).values()]
      .filter((r) => r.userId === userId && r.syncedAt > opts.since)
      .filter((r) => !opts.after || r.syncedAt > opts.after.syncedAt || (r.syncedAt === opts.after.syncedAt && r.id > opts.after.id))
      .sort((a, b) => a.syncedAt - b.syncedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .slice(0, opts.limit);
    return rows.map(({ id, syncedAt, data }) => ({ id, syncedAt, data: clone(data) }));
  }

  async getPurchase(id: string) {
    const p = this.purchases.get(id);
    return p ? clone(p) : null;
  }
  async putPurchase(p: PurchaseDoc) {
    this.purchases.set(p._id, clone(p));
  }
  async listPurchases(userId: string) {
    return [...this.purchases.values()].filter((p) => p.userId === userId).map(clone);
  }
  async getEntitlement(userId: string) {
    const e = this.entitlements.get(userId);
    return e ? clone(e) : null;
  }
  async putEntitlement(e: EntitlementDoc) {
    this.entitlements.set(e._id, clone(e));
  }

  async getAiCache(key: string, now: number) {
    const d = this.aiCache.get(key);
    return d && d.expiresAt > now ? clone(d) : null;
  }
  async putAiCache(doc: AiCacheDoc) {
    this.aiCache.set(doc._id, clone(doc));
  }
  async addAiSpend(month: string, delta: AiUsageDelta, now: number) {
    const cur: AiSpendDoc = this.aiSpend.get(month) ?? {
      _id: month,
      usdMicros: 0,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      fallbacks: 0,
      updatedAt: now,
    };
    for (const k of Object.keys(delta) as (keyof AiUsageDelta)[]) cur[k] += delta[k];
    cur.updatedAt = now;
    this.aiSpend.set(month, cur);
    return clone(cur);
  }
  async getAiSpend(month: string) {
    const d = this.aiSpend.get(month);
    return d ? clone(d) : null;
  }

  async mergeAnonymousUser(fromUserId: string, toUserId: string) {
    for (const p of this.purchases.values()) if (p.userId === fromUserId) p.userId = toUserId;
    await this.deleteUserData(fromUserId);
  }
  async deleteUserData(userId: string, email?: string) {
    const user = this.users.get(userId);
    this.users.delete(userId);
    for (const [k, t] of this.refreshTokens) if (t.userId === userId) this.refreshTokens.delete(k);
    const mail = email ?? user?.email;
    if (mail) await this.deleteEmailCodes(mail);
    for (const t of this.tables.values()) for (const [k, r] of t) if (r.userId === userId) t.delete(k);
    for (const [k, p] of this.purchases) if (p.userId === userId) this.purchases.delete(k);
    this.entitlements.delete(userId);
    for (const [k, d] of this.aiCache) if (d.userId === userId) this.aiCache.delete(k);
  }
}
