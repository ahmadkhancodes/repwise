import { planForAppleProduct, planForPlayBasePlan, type Config } from '../config';
import type { Db, EntitlementDoc, PurchaseDoc, PurchaseState } from '../db/types';
import type { Deps } from '../types';
import type { AppleRenewalInfo, AppleTransaction } from './apple';
import type { PlaySubscriptionV2 } from './play';

const ENTITLED: PurchaseState[] = ['active', 'grace', 'canceled'];

export function isEntitled(p: PurchaseDoc, now: number): boolean {
  return p.plan !== null && ENTITLED.includes(p.state) && p.expiresAt !== null && p.expiresAt > now;
}

/** Pure: the entitlement a user has from their stored purchases. */
export function computeEntitlement(userId: string, purchases: PurchaseDoc[], now: number): EntitlementDoc {
  const active = purchases.filter((p) => p.userId === userId && isEntitled(p, now)).sort((a, b) => (b.expiresAt ?? 0) - (a.expiresAt ?? 0));
  const best = active[0];
  return {
    _id: userId,
    pro: !!best,
    source: best?.source ?? null,
    plan: best?.plan ?? null,
    expiresAt: best?.expiresAt ?? null,
    inTrial: best?.inTrial ?? false,
    autoRenew: best?.autoRenew ?? false,
    updatedAt: now,
  };
}

/** Entitlements are written ONLY here (billing routes and webhooks). */
export async function recomputeEntitlement(deps: Deps, db: Db, userId: string): Promise<EntitlementDoc> {
  const e = computeEntitlement(userId, await db.listPurchases(userId), deps.now());
  await db.putEntitlement(e);
  return e;
}

/** What the app sees. Pro also requires the stored expiry to be in the future at read time. */
export function publicEntitlement(e: EntitlementDoc | null, now: number) {
  const pro = !!e && e.pro && e.expiresAt !== null && e.expiresAt > now;
  return {
    pro,
    plan: pro ? e!.plan : null,
    source: pro ? e!.source : null,
    expiresAt: pro ? e!.expiresAt : null,
    inTrial: pro ? e!.inTrial : false,
    autoRenew: pro ? e!.autoRenew : false,
    updatedAt: e?.updatedAt ?? null,
  };
}

/** Pure: map a verified StoreKit 2 transaction (+ optional renewal info / API status) to a purchase. */
export function appleToPurchase(
  cfg: Config,
  tx: AppleTransaction,
  renewal: AppleRenewalInfo | null,
  status: number | null,
  now: number,
  base: Pick<PurchaseDoc, 'userId'> & { lastEventAt?: number },
): PurchaseDoc {
  const grace = renewal?.gracePeriodExpiresDate ?? null;
  let state: PurchaseState;
  let expiresAt = tx.expiresDate ?? null;
  if (tx.revocationDate || status === 5) state = 'revoked';
  else if (status === 4 || (status === null && (expiresAt ?? 0) <= now && grace && grace > now)) {
    state = 'grace';
    expiresAt = grace ?? expiresAt;
  } else if (status === 3) state = 'on_hold';
  else if (status === 2) state = 'expired';
  else if (status === 1) state = 'active';
  else state = expiresAt && expiresAt > now ? 'active' : 'expired';
  return {
    _id: `apple:${tx.originalTransactionId}`,
    userId: base.userId,
    source: 'apple',
    originalTransactionId: tx.originalTransactionId,
    productId: tx.productId,
    basePlanId: null,
    plan: planForAppleProduct(cfg, tx.productId),
    state,
    expiresAt,
    inTrial: tx.offerType === 1 && (tx.offerDiscountType === undefined || tx.offerDiscountType === 'FREE_TRIAL'),
    autoRenew: renewal ? renewal.autoRenewStatus === 1 : state === 'active',
    environment: tx.environment ?? 'Production',
    lastEventAt: base.lastEventAt ?? tx.signedDate ?? now,
    raw: { transaction: tx, renewal, status },
    updatedAt: now,
  };
}

const PLAY_STATES: Record<string, PurchaseState> = {
  SUBSCRIPTION_STATE_ACTIVE: 'active',
  SUBSCRIPTION_STATE_IN_GRACE_PERIOD: 'grace',
  SUBSCRIPTION_STATE_CANCELED: 'canceled',
  SUBSCRIPTION_STATE_ON_HOLD: 'on_hold',
  SUBSCRIPTION_STATE_PAUSED: 'paused',
  SUBSCRIPTION_STATE_PENDING: 'pending',
  SUBSCRIPTION_STATE_EXPIRED: 'expired',
  SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED: 'expired',
};

/** Pure: map a subscriptionsv2 resource to a purchase. */
export function playToPurchase(cfg: Config, purchaseToken: string, sub: PlaySubscriptionV2, now: number, userId: string | null): PurchaseDoc {
  const items = (sub.lineItems ?? []).filter((li) => li.productId === cfg.plans.android.subscriptionId);
  const item = items.sort((a, b) => Date.parse(b.expiryTime ?? '') - Date.parse(a.expiryTime ?? ''))[0];
  const exp = item?.expiryTime ? Date.parse(item.expiryTime) : NaN;
  const basePlanId = item?.offerDetails?.basePlanId ?? null;
  const offer = item?.offerDetails;
  const inTrial =
    item?.offerPhase?.freeTrial !== undefined ||
    !!offer?.offerTags?.some((t) => /trial/i.test(t)) ||
    /trial/i.test(offer?.offerId ?? '');
  const state = PLAY_STATES[sub.subscriptionState ?? ''] ?? 'expired';
  return {
    _id: `play:${purchaseToken}`,
    userId,
    source: 'play',
    purchaseToken,
    productId: item?.productId ?? (sub.lineItems?.[0]?.productId ?? 'unknown'),
    basePlanId,
    plan: item ? planForPlayBasePlan(cfg, item.productId ?? '', basePlanId) : null,
    state,
    expiresAt: Number.isFinite(exp) ? exp : null,
    inTrial: inTrial && (state === 'active' || state === 'canceled'),
    autoRenew: item?.autoRenewingPlan?.autoRenewEnabled === true,
    environment: sub.testPurchase ? 'test' : 'production',
    lastEventAt: now,
    raw: sub,
    updatedAt: now,
  };
}

/** Store a purchase; recompute the entitlement of its owner and of any previous owner (transfer). */
export async function savePurchase(deps: Deps, db: Db, doc: PurchaseDoc, previousOwner: string | null): Promise<EntitlementDoc | null> {
  await db.putPurchase(doc);
  if (previousOwner && previousOwner !== doc.userId) await recomputeEntitlement(deps, db, previousOwner);
  return doc.userId ? recomputeEntitlement(deps, db, doc.userId) : null;
}
