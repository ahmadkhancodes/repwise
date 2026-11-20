import { Hono } from 'hono';
import type { AppleRenewalInfo } from '../billing/apple';
import { appleToPurchase, playToPurchase, savePurchase } from '../billing/entitlement';
import { b64Decode } from '../lib/crypto';
import { badRequest, clientIp, unauthorized } from '../lib/http';
import { rateLimit } from '../lib/middleware';
import { parseJson, parseWith } from '../lib/validate';
import { AppleNotificationPayload, AppleWebhookBody, PlayRtdn, PlayWebhookBody } from '../schemas';
import type { AppEnv } from '../types';
import { acknowledgeIfNeeded, paymentsGate, retireLinkedPlayToken } from './billing';

export const webhookRoutes = new Hono<AppEnv>();
webhookRoutes.use('*', paymentsGate);
// Stores retry on failure; a flood from one address only wastes signature checks. Generous cap.
webhookRoutes.use('*', async (c, next) => {
  await rateLimit(c, `webhook:ip:${clientIp(c)}`, 300, 60_000);
  await next();
});

/** App Store Server Notifications v2: body {signedPayload}, a JWS chained to Apple's root. */
webhookRoutes.post('/apple', async (c) => {
  const body = await parseJson(c, AppleWebhookBody, 160 * 1024);
  const deps = c.get('deps');
  const cfg = deps.config;
  // Signature (x5c chain to the pinned Apple root) first, then the payload's shape.
  const n = parseWith(AppleNotificationPayload, await deps.appleStore.verifyNotification(body.signedPayload));
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
  const body = await parseJson(c, PlayWebhookBody, 64 * 1024);
  let decoded: unknown;
  try {
    decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(b64Decode(body.message.data.replace(/-/g, '+').replace(/_/g, '/'))));
  } catch {
    throw badRequest('invalid_message');
  }
  const parsed = PlayRtdn.safeParse(decoded);
  if (!parsed.success) throw badRequest('invalid_message');
  const rtdn = parsed.data;
  const cfg = deps.config;
  if (rtdn.packageName !== cfg.play.packageName) return c.json({ ok: true, ignored: true });

  const db = await deps.db();
  const now = deps.now();
  const voided = rtdn.voidedPurchaseNotification;
  if (voided) {
    const existing = await db.getPurchase(`play:${voided.purchaseToken}`);
    if (existing) await savePurchase(deps, db, { ...existing, state: 'revoked', lastEventAt: now, updatedAt: now }, existing.userId);
    return c.json({ ok: true });
  }
  const sn = rtdn.subscriptionNotification;
  if (!sn) return c.json({ ok: true, ignored: true });
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
