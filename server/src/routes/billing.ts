import { Hono, type MiddlewareHandler } from 'hono';
import { appleToPurchase, playToPurchase, publicEntitlement, savePurchase } from '../billing/entitlement';
import type { PlaySubscriptionV2 } from '../billing/play';
import type { Db } from '../db/types';
import { HttpError, badRequest, notFound, readJson, str } from '../lib/http';
import { rateLimit, requireUser } from '../lib/middleware';
import type { AppEnv, Deps } from '../types';

/** Every billing route (and webhook) is a 404 while payments_enabled is off. */
export const paymentsGate: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('deps').config.paymentsEnabled) throw notFound();
  await next();
};

/** Upgrades/resubscribes on Play link to the old token: mark it replaced so it never grants Pro twice. */
export async function retireLinkedPlayToken(deps: Deps, db: Db, sub: PlaySubscriptionV2): Promise<string | null> {
  if (!sub.linkedPurchaseToken) return null;
  const old = await db.getPurchase(`play:${sub.linkedPurchaseToken}`);
  if (!old) return null;
  await savePurchase(deps, db, { ...old, state: 'replaced', updatedAt: deps.now() }, null);
  return old.userId;
}

export async function acknowledgeIfNeeded(deps: Deps, sub: PlaySubscriptionV2, token: string): Promise<void> {
  const st = sub.subscriptionState;
  if (sub.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING' && (st === 'SUBSCRIPTION_STATE_ACTIVE' || st === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD')) {
    await deps.play.acknowledge(deps.config.plans.android.subscriptionId, token);
  }
}

/**
 * The account the app bound the purchase to (StoreKit appAccountToken / Play obfuscated account id).
 * A replayed receipt must not move a purchase away from a signed-in account: that account restores
 * it itself. Anonymous owners (lost on reinstall) and unbound purchases may still be restored here.
 */
async function assertBoundTo(db: Db, boundTo: string | null | undefined, userId: string): Promise<void> {
  if (!boundTo || boundTo.toLowerCase() === userId.toLowerCase()) return;
  const owner = (await db.getUser(boundTo)) ?? (await db.getUser(boundTo.toLowerCase()));
  if (owner && !owner.anonymous && owner._id !== userId) throw new HttpError(409, 'purchase_belongs_to_another_account');
}

export const billingRoutes = new Hono<AppEnv>();
billingRoutes.use('*', paymentsGate);
billingRoutes.use('*', requireUser());

billingRoutes.post('/verify', async (c) => {
  const body = await readJson(c, 64 * 1024);
  const userId = c.get('userId');
  await rateLimit(c, `billing:${userId}`, 30, 60_000);
  const deps = c.get('deps');
  const cfg = deps.config;
  const db = await deps.db();
  const now = deps.now();

  if (body.platform === 'ios') {
    const jws = str(body, 'signedTransaction', { max: 64 * 1024 });
    let tx = await deps.appleStore.verifyTransaction(jws);
    if (tx.bundleId !== cfg.apple.bundleId) throw badRequest('wrong_app');
    if (tx.type && tx.type !== 'Auto-Renewable Subscription') throw badRequest('not_a_subscription');
    // Prefer the App Store Server API's current status when keys are configured.
    const status = await deps.appleStore.getSubscriptionStatus(tx.originalTransactionId, tx.environment);
    if (status && status.transaction.bundleId === cfg.apple.bundleId) tx = status.transaction;
    await assertBoundTo(db, tx.appAccountToken, userId);
    const existing = await db.getPurchase(`apple:${tx.originalTransactionId}`);
    // Store-side time, never ours: a later-signed webhook (refund, renewal) must still apply.
    const eventAt = tx.signedDate ?? status?.renewal?.signedDate ?? now;
    const fresh = appleToPurchase(cfg, tx, status?.renewal ?? null, status?.status ?? null, now, { userId, lastEventAt: eventAt });
    if (!fresh.plan) throw badRequest('unknown_product');
    // An older JWS than what a notification already applied only transfers ownership.
    const doc = existing && existing.lastEventAt > eventAt ? { ...existing, userId, updatedAt: now } : fresh;
    // The verifying account owns the purchase (restore on a new account transfers it).
    await savePurchase(deps, db, doc, existing?.userId ?? null);
  } else if (body.platform === 'android') {
    const token = str(body, 'purchaseToken', { max: 1024 });
    const productId = str(body, 'productId', { max: 200 });
    if (productId !== cfg.plans.android.subscriptionId) throw badRequest('unknown_product');
    const sub = await deps.play.getSubscription(token);
    if (!sub) throw badRequest('invalid_purchase');
    await assertBoundTo(db, sub.externalAccountIdentifiers?.obfuscatedExternalAccountId, userId);
    const existing = await db.getPurchase(`play:${token}`);
    const doc = playToPurchase(cfg, token, sub, now, userId);
    if (!doc.plan) throw badRequest('unknown_product');
    await acknowledgeIfNeeded(deps, sub, token);
    await retireLinkedPlayToken(deps, db, sub);
    await savePurchase(deps, db, doc, existing?.userId ?? null);
  } else {
    throw badRequest('invalid_platform');
  }
  return c.json(publicEntitlement(await db.getEntitlement(userId), now));
});

billingRoutes.get('/entitlement', async (c) => {
  const deps = c.get('deps');
  const db = await deps.db();
  return c.json(publicEntitlement(await db.getEntitlement(c.get('userId')), deps.now()));
});


