import { generateKeyPair, exportPKCS8 } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { createAppleStore, verifyAppleJws } from '../src/billing/apple';
import { computeEntitlement } from '../src/billing/entitlement';
import { createPlayApi, pubsubVerifier } from '../src/billing/play';
import { loadConfig } from '../src/config';
import type { PurchaseDoc } from '../src/db/types';
import { b64Decode, b64Encode } from '../src/lib/crypto';
import { appleChain, makeCert, type AppleChain } from './certs';
import { call, makeIssuer, setup, signInEmail, T0 } from './helpers';

let chain: AppleChain;
beforeAll(async () => {
  chain = await appleChain();
});

const DAY = 86_400_000;
const yearlyTx = (over: Record<string, unknown> = {}) => ({
  transactionId: '2000000001',
  originalTransactionId: '1000000001',
  bundleId: 'com.client.repwise',
  productId: 'com.client.repwise.pro.yearly',
  type: 'Auto-Renewable Subscription',
  purchaseDate: T0 - DAY,
  expiresDate: T0 + 6 * DAY,
  offerType: 1,
  offerDiscountType: 'FREE_TRIAL',
  environment: 'Sandbox',
  signedDate: T0 - DAY,
  ...over,
});

async function paid(env: Record<string, string> = {}) {
  return setup({ env: { PAYMENTS_ENABLED: 'true', APPLE_ROOT_CA_G3_B64: chain.rootB64, ...env } });
}

describe('payments flag', () => {
  it('every billing route and webhook is 404 while payments_enabled is off', async () => {
    const t = await setup();
    const s = await signInEmail(t, 'p@example.com');
    for (const [m, p] of [['POST', '/billing/verify'], ['GET', '/billing/entitlement'], ['POST', '/webhooks/apple'], ['POST', '/webhooks/play']] as const) {
      expect((await call(t, m, p, { body: {} })).status, p).toBe(404);
      expect((await call(t, m, p, { body: {}, token: s.accessToken })).status, p).toBe(404);
    }
    expect((await call(t, 'GET', '/config')).body.plans).toBeNull();
  });

  it('/config exposes the 4 plan product ids when enabled', async () => {
    const t = await paid();
    const cfg = (await call(t, 'GET', '/config')).body;
    expect(cfg.payments_enabled).toBe(true);
    expect(Object.keys(cfg.plans.ios)).toEqual(['weekly', 'monthly', 'quarterly', 'yearly']);
    expect(cfg.plans.android.subscriptionId).toBe('repwise_pro');
  });
});

describe('App Store JWS verification', () => {
  const roots = () => [b64Decode(chain.rootB64)];

  it('accepts a JWS chained to the pinned root', async () => {
    const tx = await verifyAppleJws<{ productId: string }>(await chain.sign(yearlyTx()), roots(), Date.now());
    expect(tx.productId).toBe('com.client.repwise.pro.yearly');
  });

  it('accepts a chain whose top is signed by the pinned root (root omitted)', async () => {
    const jws = await chain.sign(yearlyTx(), [chain.leaf, chain.intermediate]);
    await expect(verifyAppleJws(jws, roots(), Date.now())).resolves.toBeTruthy();
  });

  it('rejects other roots, tampering, wrong signer, expired certs and missing Apple OIDs', async () => {
    const other = await appleChain();
    await expect(verifyAppleJws(await other.sign(yearlyTx()), roots(), Date.now())).rejects.toThrow();
    const good = await chain.sign(yearlyTx());
    const [h, , s] = good.split('.');
    const forgedPayload = btoa(JSON.stringify(yearlyTx({ expiresDate: T0 + 999 * DAY }))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    await expect(verifyAppleJws(`${h}.${forgedPayload}.${s}`, roots(), Date.now())).rejects.toThrow();
    await expect(verifyAppleJws(await chain.sign(yearlyTx(), undefined, other.leaf.keys.privateKey), roots(), Date.now())).rejects.toThrow();
    // Intermediate re-used as a fake leaf (no receipt-signing OID).
    const fakeLeaf = await makeCert({ cn: 'leaf', curve: 'P-256', issuer: chain.intermediate, isCa: false });
    await expect(verifyAppleJws(await chain.sign(yearlyTx(), [fakeLeaf, chain.intermediate, chain.root], fakeLeaf.keys.privateKey), roots(), Date.now())).rejects.toThrow();
    // Expired leaf.
    const oldLeaf = await makeCert({ cn: 'old', curve: 'P-256', issuer: chain.intermediate, isCa: false, oids: ['1.2.840.113635.100.6.11.1'], notAfter: Date.now() - DAY });
    await expect(verifyAppleJws(await chain.sign(yearlyTx(), [oldLeaf, chain.intermediate, chain.root], oldLeaf.keys.privateKey), roots(), Date.now())).rejects.toThrow();
    // Leaf signing another leaf (issuer is not a CA).
    const sub = await makeCert({ cn: 'sub', curve: 'P-256', issuer: chain.leaf, isCa: false, oids: ['1.2.840.113635.100.6.11.1'] });
    await expect(verifyAppleJws(await chain.sign(yearlyTx(), [sub, chain.leaf, chain.intermediate, chain.root], sub.keys.privateKey), roots(), Date.now())).rejects.toThrow();
    await expect(verifyAppleJws('a.b.c', roots(), Date.now())).rejects.toThrow();
  });

  it('fails closed (503) when no root is configured', async () => {
    await expect(verifyAppleJws(await chain.sign(yearlyTx()), [], Date.now())).rejects.toMatchObject({ status: 503 });
  });

  it('App Store Server API client signs an ES256 JWT and verifies the returned JWS', async () => {
    const { privateKey } = await generateKeyPair('ES256', { extractable: true });
    const cfg = loadConfig({ APPLE_ROOT_CA_G3_B64: chain.rootB64, APPLE_ISSUER_ID: 'iss-1', APPLE_KEY_ID: 'KEY123', APPLE_PRIVATE_KEY: await exportPKCS8(privateKey) });
    const signed = await chain.sign(yearlyTx({ expiresDate: T0 + 300 * DAY, offerType: undefined }));
    const renewal = await chain.sign({ originalTransactionId: '1000000001', autoRenewStatus: 0 });
    let seen: { url: string; auth: string } | null = null;
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      seen = { url, auth: String((init?.headers as Record<string, string>).authorization) };
      return new Response(JSON.stringify({ data: [{ lastTransactions: [{ originalTransactionId: '1000000001', status: 1, signedTransactionInfo: signed, signedRenewalInfo: renewal }] }] }));
    }) as typeof fetch;
    const store = createAppleStore(cfg, fakeFetch, () => Date.now());
    const st = await store.getSubscriptionStatus('1000000001', 'Sandbox');
    expect(seen!.url).toBe('https://api.storekit-sandbox.itunes.apple.com/inApps/v1/subscriptions/1000000001');
    const [hdr, body] = seen!.auth.replace('Bearer ', '').split('.').slice(0, 2).map((p) => JSON.parse(new TextDecoder().decode(b64Decode(p.replace(/-/g, '+').replace(/_/g, '/')))));
    expect(hdr).toMatchObject({ alg: 'ES256', kid: 'KEY123' });
    expect(body).toMatchObject({ iss: 'iss-1', aud: 'appstoreconnect-v1', bid: 'com.client.repwise' });
    expect(st?.status).toBe(1);
    expect(st?.renewal?.autoRenewStatus).toBe(0);
  });
});

describe('POST /billing/verify + GET /billing/entitlement', () => {
  it('iOS: a verified trial transaction unlocks Pro', async () => {
    const t = await paid();
    const s = await signInEmail(t, 'ios@example.com');
    expect((await call(t, 'GET', '/billing/entitlement', { token: s.accessToken })).body.pro).toBe(false);
    const r = await call(t, 'POST', '/billing/verify', { token: s.accessToken, body: { platform: 'ios', signedTransaction: await chain.sign(yearlyTx()) } });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ pro: true, plan: 'yearly', source: 'apple', inTrial: true, expiresAt: T0 + 6 * DAY });
    expect((await call(t, 'GET', '/billing/entitlement', { token: s.accessToken })).body.pro).toBe(true);
    t.clock.now = T0 + 7 * DAY;
    const again = await signInEmail(t, 'ios@example.com');
    expect((await call(t, 'GET', '/billing/entitlement', { token: again.accessToken })).body.pro).toBe(false);
  });

  it('iOS: rejects other apps, unknown products, forged JWS and expired transactions grant nothing', async () => {
    const t = await paid();
    const s = await signInEmail(t, 'ios2@example.com');
    const v = async (tx: Record<string, unknown>) => call(t, 'POST', '/billing/verify', { token: s.accessToken, body: { platform: 'ios', signedTransaction: await chain.sign(tx) } });
    expect((await v(yearlyTx({ bundleId: 'com.other' }))).body.error).toBe('wrong_app');
    expect((await v(yearlyTx({ productId: 'com.client.repwise.coins' }))).body.error).toBe('unknown_product');
    const other = await appleChain();
    const forged = await call(t, 'POST', '/billing/verify', { token: s.accessToken, body: { platform: 'ios', signedTransaction: await other.sign(yearlyTx()) } });
    expect(forged.status).toBe(400);
    const expired = await v(yearlyTx({ expiresDate: T0 - 1 }));
    expect(expired.body.pro).toBe(false);
    expect((await call(t, 'POST', '/billing/verify', { token: s.accessToken, body: { platform: 'web' } })).status).toBe(400);
  });

  it('Android: verifies with the Play API, acknowledges, and unlocks Pro', async () => {
    const t = await paid();
    const s = await signInEmail(t, 'and@example.com');
    t.play.subs.set('tok-1', {
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
      lineItems: [{ productId: 'repwise_pro', expiryTime: new Date(T0 + 30 * DAY).toISOString(), autoRenewingPlan: { autoRenewEnabled: true }, offerDetails: { basePlanId: 'monthly' } }],
    });
    const r = await call(t, 'POST', '/billing/verify', { token: s.accessToken, body: { platform: 'android', purchaseToken: 'tok-1', productId: 'repwise_pro' } });
    expect(r.body).toMatchObject({ pro: true, plan: 'monthly', source: 'play', autoRenew: true, inTrial: false });
    expect(t.play.acked).toEqual(['tok-1']);
    expect((await call(t, 'POST', '/billing/verify', { token: s.accessToken, body: { platform: 'android', purchaseToken: 'nope', productId: 'repwise_pro' } })).body.error).toBe('invalid_purchase');
    expect((await call(t, 'POST', '/billing/verify', { token: s.accessToken, body: { platform: 'android', purchaseToken: 'tok-1', productId: 'other' } })).body.error).toBe('unknown_product');
  });

  it('cross-platform restore: verifying on another account transfers the purchase', async () => {
    const t = await paid();
    const a = await signInEmail(t, 'first@example.com');
    const b = await signInEmail(t, 'second@example.com');
    const jws = await chain.sign(yearlyTx());
    await call(t, 'POST', '/billing/verify', { token: a.accessToken, body: { platform: 'ios', signedTransaction: jws } });
    await call(t, 'POST', '/billing/verify', { token: b.accessToken, body: { platform: 'ios', signedTransaction: jws } });
    expect((await call(t, 'GET', '/billing/entitlement', { token: b.accessToken })).body.pro).toBe(true);
    expect((await call(t, 'GET', '/billing/entitlement', { token: a.accessToken })).body.pro).toBe(false);
  });

  it('Pro comes only from stored entitlement: client claims are ignored', async () => {
    const t = await paid();
    const s = await signInEmail(t, 'claim@example.com');
    await call(t, 'POST', '/billing/verify', { token: s.accessToken, body: { platform: 'android', purchaseToken: 'fake', productId: 'repwise_pro', pro: true } });
    expect((await call(t, 'GET', '/billing/entitlement', { token: s.accessToken })).body.pro).toBe(false);
  });
});

describe('webhooks', () => {
  it('Apple ASSN v2: renewal extends, refund revokes, stale events are ignored', async () => {
    const t = await paid();
    const s = await signInEmail(t, 'wh@example.com');
    await call(t, 'POST', '/billing/verify', { token: s.accessToken, body: { platform: 'ios', signedTransaction: await chain.sign(yearlyTx()) } });
    const note = async (type: string, tx: Record<string, unknown>, signedDate: number) =>
      call(t, 'POST', '/webhooks/apple', {
        body: {
          signedPayload: await chain.sign({
            notificationType: type,
            notificationUUID: crypto.randomUUID(),
            signedDate,
            data: { bundleId: 'com.client.repwise', environment: 'Sandbox', signedTransactionInfo: await chain.sign(tx), signedRenewalInfo: await chain.sign({ autoRenewStatus: 1 }) },
          }),
        },
      });
    t.clock.now = T0 + DAY;
    s.accessToken = (await signInEmail(t, 'wh@example.com')).accessToken;
    expect((await note('DID_RENEW', yearlyTx({ offerType: undefined, expiresDate: T0 + 371 * DAY }), T0 + DAY)).status).toBe(200);
    let e = (await call(t, 'GET', '/billing/entitlement', { token: s.accessToken })).body;
    expect(e).toMatchObject({ pro: true, inTrial: false, expiresAt: T0 + 371 * DAY });
    // Older notification arriving late must not roll the state back.
    await note('EXPIRED', yearlyTx({ expiresDate: T0 - DAY }), T0);
    expect((await call(t, 'GET', '/billing/entitlement', { token: s.accessToken })).body.pro).toBe(true);
    await note('REFUND', yearlyTx({ expiresDate: T0 + 371 * DAY }), T0 + 2 * DAY);
    e = (await call(t, 'GET', '/billing/entitlement', { token: s.accessToken })).body;
    expect(e.pro).toBe(false);
    expect((await call(t, 'POST', '/webhooks/apple', { body: { signedPayload: 'x.y.z' } })).status).toBe(400);
  });

  it('Apple: an unknown purchase binds to the appAccountToken user', async () => {
    const t = await paid();
    const s = await signInEmail(t, 'aat@example.com');
    await call(t, 'POST', '/webhooks/apple', {
      body: {
        signedPayload: await chain.sign({
          notificationType: 'SUBSCRIBED',
          notificationUUID: 'u1',
          signedDate: T0,
          data: { bundleId: 'com.client.repwise', signedTransactionInfo: await chain.sign(yearlyTx({ appAccountToken: s.user.id })) },
        }),
      },
    });
    expect((await call(t, 'GET', '/billing/entitlement', { token: s.accessToken })).body.pro).toBe(true);
  });

  it('Play RTDN: requires auth, refetches state from Google, handles voided purchases', async () => {
    const t = await setup({ env: { PAYMENTS_ENABLED: 'true', PLAY_RTDN_SECRET: 'rtdn-secret-1234567890' } });
    t.deps.verifyPubsub = pubsubVerifier(t.deps.config);
    const s = await signInEmail(t, 'rtdn@example.com');
    const push = (payload: unknown, q = '?token=rtdn-secret-1234567890') =>
      call(t, 'POST', `/webhooks/play${q}`, { body: { message: { data: b64Encode(new TextEncoder().encode(JSON.stringify(payload))), messageId: '1' }, subscription: 'x' } });
    const sub = (state: string, exp: number) => ({
      subscriptionState: state,
      externalAccountIdentifiers: { obfuscatedExternalAccountId: s.user.id },
      lineItems: [{ productId: 'repwise_pro', expiryTime: new Date(exp).toISOString(), offerDetails: { basePlanId: 'weekly', offerId: 'free-trial' }, offerPhase: { freeTrial: {} } }],
    });
    const rtdn = { version: '1.0', packageName: 'com.client.repwise', subscriptionNotification: { notificationType: 4, purchaseToken: 'tok-9', subscriptionId: 'repwise_pro' } };
    t.play.subs.set('tok-9', sub('SUBSCRIPTION_STATE_ACTIVE', T0 + 7 * DAY));
    expect((await push(rtdn, '')).status).toBe(401);
    expect((await push(rtdn, '?token=wrong')).status).toBe(401);
    expect((await push(rtdn)).status).toBe(200);
    expect((await call(t, 'GET', '/billing/entitlement', { token: s.accessToken })).body).toMatchObject({ pro: true, plan: 'weekly', inTrial: true });
    t.play.subs.set('tok-9', sub('SUBSCRIPTION_STATE_ON_HOLD', T0 + 7 * DAY));
    await push(rtdn);
    expect((await call(t, 'GET', '/billing/entitlement', { token: s.accessToken })).body.pro).toBe(false);
    t.play.subs.set('tok-9', sub('SUBSCRIPTION_STATE_ACTIVE', T0 + 14 * DAY));
    await push(rtdn);
    expect((await call(t, 'GET', '/billing/entitlement', { token: s.accessToken })).body.pro).toBe(true);
    await push({ packageName: 'com.client.repwise', voidedPurchaseNotification: { purchaseToken: 'tok-9', orderId: 'o' } });
    expect((await call(t, 'GET', '/billing/entitlement', { token: s.accessToken })).body.pro).toBe(false);
    expect((await push({ packageName: 'com.other', subscriptionNotification: { purchaseToken: 'tok-9' } })).body.ignored).toBe(true);
    expect((await call(t, 'POST', '/webhooks/play?token=rtdn-secret-1234567890', { body: { message: { data: '!!!' } } })).status).toBe(400);
  });

  it('Play RTDN: a linked (upgraded) token replaces the old purchase', async () => {
    const t = await setup({ env: { PAYMENTS_ENABLED: 'true' }, verifyPubsub: async () => true });
    const s = await signInEmail(t, 'up@example.com');
    const item = (base: string, exp: number) => [{ productId: 'repwise_pro', expiryTime: new Date(exp).toISOString(), offerDetails: { basePlanId: base } }];
    t.play.subs.set('old', { subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', lineItems: item('monthly', T0 + 20 * DAY) });
    await call(t, 'POST', '/billing/verify', { token: s.accessToken, body: { platform: 'android', purchaseToken: 'old', productId: 'repwise_pro' } });
    t.play.subs.set('new', { subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', linkedPurchaseToken: 'old', lineItems: item('yearly', T0 + 365 * DAY) });
    const data = b64Encode(new TextEncoder().encode(JSON.stringify({ packageName: 'com.client.repwise', subscriptionNotification: { purchaseToken: 'new' } })));
    await call(t, 'POST', '/webhooks/play', { body: { message: { data } } });
    expect((await t.db.getPurchase('play:old'))?.state).toBe('replaced');
    expect((await call(t, 'GET', '/billing/entitlement', { token: s.accessToken })).body.plan).toBe('yearly');
  });

  it('Pub/Sub OIDC verification checks issuer, audience and service account', async () => {
    const issuer = await makeIssuer('https://accounts.google.com', 'https://api.repwise.app/webhooks/play');
    const cfg = loadConfig({ PLAY_PUBSUB_AUDIENCE: 'https://api.repwise.app/webhooks/play', PLAY_PUBSUB_SERVICE_ACCOUNT: 'rtdn@proj.iam.gserviceaccount.com' });
    const verify = pubsubVerifier(cfg, issuer.jwks);
    const good = await issuer.sign({ email: 'rtdn@proj.iam.gserviceaccount.com', email_verified: true });
    expect(await verify({ authorization: `Bearer ${good}` })).toBe(true);
    expect(await verify({ authorization: `Bearer ${await issuer.sign({ email: 'x@evil.com', email_verified: true })}` })).toBe(false);
    expect(await verify({ authorization: `Bearer ${await issuer.sign({ email: 'rtdn@proj.iam.gserviceaccount.com', email_verified: true }, { aud: 'other' })}` })).toBe(false);
    expect(await verify({})).toBe(false);
    expect(await pubsubVerifier(loadConfig({}))({ token: '' })).toBe(false); // nothing configured: fail closed
  });

  it('Play API client exchanges a service-account JWT and calls subscriptionsv2', async () => {
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    const sa = JSON.stringify({ client_email: 'svc@proj.iam.gserviceaccount.com', private_key: await exportPKCS8(privateKey), token_uri: 'https://oauth2.googleapis.com/token' });
    const calls: string[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.endsWith('/token')) {
        expect(String(init?.body)).toContain('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer');
        return new Response(JSON.stringify({ access_token: 'ya29.x', expires_in: 3600 }));
      }
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer ya29.x');
      return url.includes('missing') ? new Response('{}', { status: 404 }) : new Response(JSON.stringify({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE' }));
    }) as typeof fetch;
    const api = createPlayApi(loadConfig({ PLAY_SERVICE_ACCOUNT_JSON: sa }), fakeFetch, () => Date.now());
    expect((await api.getSubscription('abc'))?.subscriptionState).toBe('SUBSCRIPTION_STATE_ACTIVE');
    expect(await api.getSubscription('missing')).toBeNull();
    await api.acknowledge('repwise_pro', 'abc');
    expect(calls.filter((c) => c.endsWith('/token'))).toHaveLength(1); // token cached
    expect(calls).toContain('GET https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.client.repwise/purchases/subscriptionsv2/tokens/abc');
    expect(calls).toContain('POST https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.client.repwise/purchases/subscriptions/repwise_pro/tokens/abc:acknowledge');
  });
});

describe('computeEntitlement', () => {
  const p = (over: Partial<PurchaseDoc>): PurchaseDoc => ({
    _id: 'x', userId: 'u', source: 'apple', productId: 'p', plan: 'monthly', state: 'active', expiresAt: 2000, inTrial: false, autoRenew: true, lastEventAt: 0, raw: null, updatedAt: 0, ...over,
  });
  it('picks the active purchase with the latest expiry and ignores the rest', () => {
    const e = computeEntitlement('u', [p({ _id: 'a', expiresAt: 1500 }), p({ _id: 'b', plan: 'yearly', expiresAt: 5000, source: 'play' }), p({ _id: 'c', state: 'revoked', expiresAt: 9000 })], 1000);
    expect(e).toMatchObject({ pro: true, plan: 'yearly', source: 'play', expiresAt: 5000 });
    expect(computeEntitlement('u', [p({ state: 'on_hold' }), p({ state: 'canceled', expiresAt: 999 })], 1000).pro).toBe(false);
    expect(computeEntitlement('u', [p({ state: 'grace', expiresAt: 1100 })], 1000).pro).toBe(true);
    expect(computeEntitlement('u', [p({ plan: null })], 1000).pro).toBe(false);
    expect(computeEntitlement('u', [p({ userId: 'other' })], 1000).pro).toBe(false);
  });
});
