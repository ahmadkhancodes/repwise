import type { BillingPlatform, VerifyRequest } from '@/services/billingApi';

/**
 * Purchases waiting for `/billing/verify` (offline, Worker down, 5xx). Persisted in MMKV
 * so a purchase made in a tunnel is never lost; the store transaction stays UNFINISHED until
 * the Worker has verified it. Pure list operations.
 */
export type QueuedPurchase = {
  key: string;
  platform: BillingPlatform;
  productId: string;
  /** iOS: StoreKit 2 transaction id. Android: order id or the token. */
  transactionId: string;
  /** iOS: JWS signed transaction. Android: purchase token. */
  token: string;
  attempts: number;
  nextAttemptAt: number;
  addedAt: number;
  lastError?: string;
};

export const MAX_BACKOFF_MS = 60 * 60 * 1000;
const BASE_BACKOFF_MS = 5_000;
export const MAX_QUEUE = 50;

export function purchaseKey(
  platform: BillingPlatform,
  transactionId: string,
  token: string,
): string {
  return platform === 'ios' ? `ios:${transactionId}` : `android:${token}`;
}

/** 5 s, 10 s, 20 s … capped at 1 h. */
export function backoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}

/** Add or refresh (same key keeps its attempt count, takes the newest token). */
export function enqueue(
  q: readonly QueuedPurchase[],
  item: Omit<QueuedPurchase, 'key' | 'attempts' | 'nextAttemptAt' | 'addedAt'>,
  now: number,
): QueuedPurchase[] {
  const key = purchaseKey(item.platform, item.transactionId, item.token);
  const existing = q.find((x) => x.key === key);
  const next: QueuedPurchase = existing
    ? { ...existing, token: item.token, productId: item.productId }
    : { ...item, key, attempts: 0, nextAttemptAt: now, addedAt: now };
  const rest = q.filter((x) => x.key !== key);
  return [...rest, next].slice(-MAX_QUEUE);
}

export function dequeue(q: readonly QueuedPurchase[], key: string): QueuedPurchase[] {
  return q.filter((x) => x.key !== key);
}

export function markFailed(
  q: readonly QueuedPurchase[],
  key: string,
  now: number,
  error: string,
): QueuedPurchase[] {
  return q.map((x) => {
    if (x.key !== key) return x;
    const attempts = x.attempts + 1;
    return { ...x, attempts, nextAttemptAt: now + backoffMs(attempts), lastError: error };
  });
}

/** Due items, oldest first. `force` ignores the backoff (app foreground, manual retry). */
export function dueItems(
  q: readonly QueuedPurchase[],
  now: number,
  force = false,
): QueuedPurchase[] {
  return q.filter((x) => force || x.nextAttemptAt <= now).sort((a, b) => a.addedAt - b.addedAt);
}

export function nextDueAt(q: readonly QueuedPurchase[]): number | null {
  return q.length ? Math.min(...q.map((x) => x.nextAttemptAt)) : null;
}

export function verifyBody(
  item: Pick<QueuedPurchase, 'platform' | 'token' | 'productId'>,
): VerifyRequest {
  return item.platform === 'ios'
    ? { platform: 'ios', signedTransaction: item.token }
    : { platform: 'android', purchaseToken: item.token, productId: item.productId };
}

export function parseQueue(raw: string | undefined | null): QueuedPurchase[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v)
      ? (v as QueuedPurchase[]).filter(
          (x) => x && typeof x.key === 'string' && typeof x.token === 'string',
        )
      : [];
  } catch {
    return [];
  }
}
