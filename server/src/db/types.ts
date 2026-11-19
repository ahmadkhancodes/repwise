import type { AiKind, Plan } from '../config';

export interface UserDoc {
  _id: string;
  email?: string;
  googleSub?: string;
  appleSub?: string;
  /** Silent account created before sign-in (sheet 15). Cannot use /sync. */
  anonymous: boolean;
  createdAt: number;
  lastSeenAt: number;
  country?: string;
  locale?: string;
}

export interface RefreshTokenDoc {
  _id: string;
  userId: string;
  /** sha256 of the opaque token; the token itself is never stored. */
  tokenHash: string;
  familyId: string;
  deviceId?: string;
  createdAt: number;
  expiresAt: number;
  rotatedAt?: number | null;
}

export type ConsumeRefreshResult =
  | { status: 'ok'; token: RefreshTokenDoc }
  /** Already rotated, but within the reuse grace window (a lost response being retried). */
  | { status: 'grace'; token: RefreshTokenDoc }
  | { status: 'reused'; token: RefreshTokenDoc }
  | { status: 'missing' };

export interface EmailCodeDoc {
  _id: string;
  email: string;
  codeHash: string;
  attempts: number;
  createdAt: number;
  expiresAt: number;
}

export type PurchaseSource = 'apple' | 'play';
export type PurchaseState = 'active' | 'grace' | 'canceled' | 'on_hold' | 'paused' | 'pending' | 'expired' | 'revoked' | 'replaced';

export interface PurchaseDoc {
  /** `apple:<originalTransactionId>` or `play:<purchaseToken>` (unique by construction). */
  _id: string;
  userId: string | null;
  source: PurchaseSource;
  purchaseToken?: string;
  originalTransactionId?: string;
  productId: string;
  basePlanId?: string | null;
  plan: Plan | null;
  state: PurchaseState;
  expiresAt: number | null;
  inTrial: boolean;
  autoRenew: boolean;
  environment?: string;
  /** Store-side event time used to ignore out-of-order notifications. */
  lastEventAt: number;
  raw: unknown;
  updatedAt: number;
}

export interface EntitlementDoc {
  _id: string; // userId
  pro: boolean;
  source: PurchaseSource | null;
  plan: Plan | null;
  expiresAt: number | null;
  inTrial: boolean;
  autoRenew: boolean;
  updatedAt: number;
}

export interface AiCacheDoc {
  _id: string; // userId:kind:inputHash
  userId: string;
  kind: AiKind;
  response: unknown;
  createdAt: number;
  expiresAt: number;
}

export interface AiUsageDelta {
  usdMicros: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  fallbacks: number;
}

export interface AiSpendDoc extends AiUsageDelta {
  _id: string; // YYYY-MM (UTC)
  updatedAt: number;
}

export type SyncValue = string | number | boolean | null;
export type SyncRow = Record<string, SyncValue>;

export interface StoredRow {
  id: string;
  syncedAt: number;
  data: SyncRow;
}

/** A push holds a lease while its rows are being written, so pulls never move their cursor past it. */
export interface SyncWriteLease {
  /** Monotonic per-user stamp for every row in this write (hybrid: max(previous + 1, now ms)). */
  seq: number;
  leaseId: string;
}

export interface PullOptions {
  since: number;
  after?: { syncedAt: number; id: string } | undefined;
  limit: number;
}

export interface Db {
  // users
  getUser(id: string): Promise<UserDoc | null>;
  findUserBy(field: 'email' | 'googleSub' | 'appleSub', value: string): Promise<UserDoc | null>;
  createUser(user: UserDoc): Promise<void>;
  updateUser(id: string, patch: Partial<Omit<UserDoc, '_id'>>): Promise<void>;
  // refresh tokens
  insertRefreshToken(t: RefreshTokenDoc): Promise<void>;
  /** Atomically mark an unexpired, unrotated token as rotated. */
  /**
   * Atomically mark an unexpired, unrotated token as rotated. A token rotated less than `graceMs`
   * ago reports `grace` (the caller may hand back the same successor) instead of `reused`.
   */
  consumeRefreshToken(tokenHash: string, now: number, graceMs?: number): Promise<ConsumeRefreshResult>;
  getRefreshToken(tokenHash: string): Promise<RefreshTokenDoc | null>;
  revokeRefreshFamily(familyId: string): Promise<void>;
  // email codes
  putEmailCode(doc: EmailCodeDoc): Promise<void>;
  getEmailCode(email: string, now: number): Promise<EmailCodeDoc | null>;
  /**
   * Atomically count one verification attempt against the newest live code for `email`, but only
   * while it has fewer than `maxAttempts`. Returns the code after the increment, or null when there
   * is no live code or it is used up. Check-and-count is one operation, so parallel guesses cannot
   * all read `attempts = 0`.
   */
  claimEmailCodeAttempt(email: string, now: number, maxAttempts: number): Promise<EmailCodeDoc | null>;
  /** Delete one code; true only for the caller that actually removed it (single use). */
  consumeEmailCode(id: string): Promise<boolean>;
  deleteEmailCodes(email: string): Promise<void>;
  // rate limits (fixed window counter); returns the count after this hit
  hit(key: string, windowMs: number, now: number): Promise<number>;
  // sync
  /** Register an in-flight write, then allocate its monotonic stamp (in that order). */
  beginSyncWrite(userId: string, now: number, leaseMs: number): Promise<SyncWriteLease>;
  endSyncWrite(userId: string, leaseId: string): Promise<void>;
  /**
   * The highest stamp a pull may advance its cursor to: every row stamped at or below it is
   * already committed (never above the oldest in-flight write's floor).
   */
  syncHighWater(userId: string, now: number, legacyOverlapMs: number): Promise<number>;
  upsertRows(table: string, userId: string, rows: SyncRow[], syncedAt: number): Promise<{ accepted: string[]; conflicts: string[] }>;
  pullRows(table: string, userId: string, opts: PullOptions): Promise<StoredRow[]>;
  // billing
  getPurchase(id: string): Promise<PurchaseDoc | null>;
  putPurchase(p: PurchaseDoc): Promise<void>;
  listPurchases(userId: string): Promise<PurchaseDoc[]>;
  getEntitlement(userId: string): Promise<EntitlementDoc | null>;
  putEntitlement(e: EntitlementDoc): Promise<void>;
  // AI
  getAiCache(key: string, now: number): Promise<AiCacheDoc | null>;
  putAiCache(doc: AiCacheDoc): Promise<void>;
  addAiSpend(month: string, delta: Partial<AiUsageDelta>, now: number): Promise<AiSpendDoc>;
  /**
   * Atomically add `micros` to the month's spend only if the total stays strictly below
   * `capMicros`. Returns false (nothing booked) otherwise.
   */
  reserveAiSpend(month: string, micros: number, capMicros: number, now: number): Promise<boolean>;
  getAiSpend(month: string): Promise<AiSpendDoc | null>;
  // account
  /** Move purchases from an anonymous user to the signed-in user, then delete the anonymous user. */
  mergeAnonymousUser(fromUserId: string, toUserId: string): Promise<void>;
  /** Remove every document belonging to the user (idempotent). */
  deleteUserData(userId: string, email?: string): Promise<void>;
}

export class DuplicateKeyError extends Error {}
