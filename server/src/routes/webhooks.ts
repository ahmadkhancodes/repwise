import { Hono } from 'hono';
import type { AppleRenewalInfo } from '../billing/apple';
import { appleToPurchase, playToPurchase, savePurchase } from '../billing/entitlement';
import { b64Decode } from '../lib/crypto';
import { badRequest, isPlainObject, readJson, str, unauthorized } from '../lib/http';
import type { AppEnv } from '../types';
import { acknowledgeIfNeeded, paymentsGate, retireLinkedPlayToken } from './billing';

export const webhookRoutes = new Hono<AppEnv>();
webhookRoutes.use('*', paymentsGate);

/** App Store Server Notifications v2: body {signedPayload}, a JWS chained to Apple's root. */
webhookRoutes.post('/apple', async (c) => {
  const body = await readJson(c, 128 * 1024);
  const deps = c.get('deps');
  const cfg = deps.config;
  const n = await deps.appleStore.verifyNotification(str(body, 'signedPayload', { max: 128 * 1024 }));
  if (n.notificationType === 'TEST') return c.json({ ok: true });
  if (n.data?.bundleId && n.data.bundleId !== cfg.apple.bundleId) throw badRequest('wrong_app');
  if (!n.data?.signedTransactionInfo) return c.json({ ok: true, ignored: true });
  const tx = await deps.appleStore.verifyTransaction(n.data.signedTransactionInfo);
  if (tx.bundleId !== cfg.apple.bundleId) throw badRequest('wrong_app');
  const renewal: AppleRenewalInfo | null = n.data.signedRenewalInfo ? await deps.appleStore.verifyRenewalInfo(n.data.signedRenewalInfo) : null;

  const db = await deps.db();
  const now = deps.now();
  const eventAt = n.signedDate ?? now;
  const existing = await db.getPurchase(`apple:${tx.originalTransactionId}`);
  if (existing && existing.lastEventAt > eventAt) return c.json({ ok: true, stale: true });

  // Owner: the account that verified it, else the appAccountToken the app set (if that user exists).
  let owner = existing?.userId ?? null;
  if (!owner && tx.appAccountToken && (await db.getUser(tx.appAccountToken))) owner = tx.appAccountToken;
  const revoked = n.notificationType === 'REFUND' || n.notificationType === 'REVOKE';
  const doc = appleToPurchase(cfg, revoked && !tx.revocationDate ? { ...tx, revocationDate: eventAt } : tx, renewal, null, now, {
    userId: owner,
    lastEventAt: eventAt,
  });
  await savePurchase(deps, db, doc, existing?.userId ?? null);
  return c.json({ ok: true });
});

/** Google Play RTDN via Pub/Sub push. Authenticated by OIDC token or shared secret (?token=). */
webhookRoutes.post('/play', async (c) => {
  const deps = c.get('deps');
  const ok = await deps.verifyPubsub({ authorization: c.req.header('authorization'), token: c.req.query('token') });
  if (!ok) throw unauthorized();
  const body = await readJson(c, 64 * 1024);
  const message = body.message;
  if (!isPlainObject(message) || typeof message.data !== 'string') throw badRequest('invalid_message');
  let rtdn: Record<string, unknown>;
  try {
    rtdn = JSON.parse(new TextDecoder().decode(b64Decode(message.data)));
  } catch {
    throw badRequest('invalid_message');
  }
  if (!isPlainObject(rtdn)) throw badRequest('invalid_message');
  const cfg = deps.config;
  if (rtdn.packageName !== cfg.play.packageName) return c.json({ ok: true, ignored: true });

  const db = await deps.db();
  const now = deps.now();
  const voided = rtdn.voidedPurchaseNotification;
  if (isPlainObject(voided) && typeof voided.purchaseToken === 'string') {
    const existing = await db.getPurchase(`play:${voided.purchaseToken}`);
    if (existing) await savePurchase(deps, db, { ...existing, state: 'revoked', lastEventAt: now, updatedAt: now }, existing.userId);
    return c.json({ ok: true });
  }
  const sn = rtdn.subscriptionNotification;
  if (!isPlainObject(sn) || typeof sn.purchaseToken !== 'string') return c.json({ ok: true, ignored: true });
  const token = sn.purchaseToken;
  // Never trust the notification body: fetch the current state from Google.
  const sub = await deps.play.getSubscription(token);
  if (!sub) return c.json({ ok: true, ignored: true });
  const existing = await db.getPurchase(`play:${token}`);
  let owner = existing?.userId ?? null;
  if (!owner) {
    const linkedOwner = sub.linkedPurchaseToken ? (await db.getPurchase(`play:${sub.linkedPurchaseToken}`))?.userId ?? null : null;
    const acct = sub.externalAccountIdentifiers?.obfuscatedExternalAccountId;
    owner = linkedOwner ?? (acct && (await db.getUser(acct)) ? acct : null);
  }
  await acknowledgeIfNeeded(deps, sub, token);
  await retireLinkedPlayToken(deps, db, sub);
  await savePurchase(deps, db, playToPurchase(cfg, token, sub, now, owner), existing?.userId ?? null);
  return c.json({ ok: true });
});
