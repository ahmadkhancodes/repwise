import type { Entitlement } from '@/services/billingApi';

import { ENTITLEMENT_REFRESH_MS, MAX_CACHE_AGE_MS, OFFLINE_GRACE_MS } from '../config';

/** The Worker entitlement plus when we last heard it from the Worker (device clock). */
export type CachedEntitlement = Entitlement & { checkedAt: number };

export const NO_ENTITLEMENT: Entitlement = {
  pro: false,
  plan: null,
  source: null,
  expiresAt: null,
  inTrial: false,
  autoRenew: false,
  updatedAt: null,
};

export function toCached(e: Entitlement, now: number): CachedEntitlement {
  return { ...e, checkedAt: now };
}

/**
 * Pro from the cached Worker entitlement. Pure.
 * Valid until the store expiry + 3 days of offline grace (a renewal we have not heard about
 * yet), and never on a cache older than 30 days. Pro is NEVER derived from the store alone.
 */
export function cachedProActive(c: CachedEntitlement | null | undefined, now: number): boolean {
  if (!c || !c.pro || c.expiresAt == null) return false;
  if (now - c.checkedAt > MAX_CACHE_AGE_MS || now < c.checkedAt - MAX_CACHE_AGE_MS) return false;
  return now < c.expiresAt + OFFLINE_GRACE_MS;
}

/** Should we ask the Worker again? Stale cache, or the period may have renewed/ended. Pure. */
export function needsRefresh(c: CachedEntitlement | null | undefined, now: number): boolean {
  if (!c) return true;
  if (now - c.checkedAt > ENTITLEMENT_REFRESH_MS) return true;
  return c.pro && c.expiresAt != null && now >= c.expiresAt;
}

/** Parse what MMKV holds; anything malformed is treated as "no cache". Pure. */
export function parseCached(raw: string | undefined | null): CachedEntitlement | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<CachedEntitlement>;
    if (
      typeof v !== 'object' ||
      v === null ||
      typeof v.pro !== 'boolean' ||
      typeof v.checkedAt !== 'number'
    ) {
      return null;
    }
    return {
      pro: v.pro,
      plan: v.plan ?? null,
      source: v.source ?? null,
      expiresAt: typeof v.expiresAt === 'number' ? v.expiresAt : null,
      inTrial: Boolean(v.inTrial),
      autoRenew: Boolean(v.autoRenew),
      updatedAt: typeof v.updatedAt === 'number' ? v.updatedAt : null,
      checkedAt: v.checkedAt,
    };
  } catch {
    return null;
  }
}
