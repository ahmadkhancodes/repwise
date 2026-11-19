import { createFakeFetch, tokenResponse } from '../../../test/fakeFetch';

import { configureApi, resetApiForTests } from '@/services/api';
import { resetAuthForTests, signOut, initAuth, verifyEmailCode } from '@/services/auth';
import { useBillingStore } from '@/services/billing';
import { BillingApiError, createWorkerBillingApi } from '@/services/billingApi';
import { linkBillingToSession } from '@/services/billingSession';
import { kv } from '@/services/storage';
import { resetTokensForTests } from '@/services/tokens';
import { resetDbForTests } from '@/db/client';
import { migrateDb } from '@/db/migrate';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const secureStore = require('expo-secure-store') as { __reset: () => void };

const ENT = {
  pro: true,
  plan: 'yearly',
  source: 'apple',
  expiresAt: 2e12,
  inTrial: true,
  autoRenew: true,
  updatedAt: 1,
};
let fake: ReturnType<typeof createFakeFetch>;

beforeEach(async () => {
  secureStore.__reset();
  resetTokensForTests();
  resetApiForTests();
  resetAuthForTests();
  resetDbForTests();
  await migrateDb();
  fake = createFakeFetch();
  configureApi({ baseUrl: fake.base, fetch: fake.fetch });
  fake.on('POST /auth/anonymous', () => ({
    status: 201,
    body: tokenResponse('anon', { id: 'anon-1', anonymous: true }),
  }));
  fake.on('GET /config', () => ({ status: 200, body: { payments_enabled: true, plans: null } }));
  fake.on('GET /billing/entitlement', () => ({ status: 200, body: ENT }));
  fake.on('POST /billing/verify', () => ({ status: 200, body: ENT }));
  await initAuth();
});

describe('Worker BillingApi', () => {
  const b = createWorkerBillingApi();

  it('getConfig needs no account', async () => {
    expect(await b.getConfig()).toEqual({ payments_enabled: true, plans: null });
    expect(fake.callsTo('POST /auth/anonymous')).toHaveLength(0);
    expect(fake.calls[0]!.auth).toBeNull();
  });

  it('verify and entitlement run on the silent anonymous account when signed out', async () => {
    const body = { platform: 'ios' as const, signedTransaction: 'jws' };
    expect(await b.verifyPurchase(body)).toEqual(ENT);
    expect(fake.callsTo('POST /billing/verify')[0]).toMatchObject({ body, auth: 'Bearer at-anon' });
    expect(await b.getEntitlement()).toEqual(ENT);
    expect(fake.callsTo('POST /auth/anonymous')).toHaveLength(1);
    expect(await b.getAccountId()).toBe('anon-1');
  });

  it('non-2xx → BillingApiError(status, code); network → not a BillingApiError', async () => {
    fake.on('POST /billing/verify', () => ({
      status: 409,
      body: { error: 'purchase_owned_elsewhere' },
    }));
    const e = await b
      .verifyPurchase({ platform: 'android', purchaseToken: 't', productId: 'p' })
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(BillingApiError);
    expect(e).toMatchObject({ status: 409, code: 'purchase_owned_elsewhere' });
    fake.setOffline(true);
    const n = await b.getConfig().catch((x: unknown) => x);
    expect(n).not.toBeInstanceOf(BillingApiError);
    expect(n).toMatchObject({ kind: 'offline' });
  });

  it('getAccountId is null offline (no account yet)', async () => {
    fake.setOffline(true);
    expect(await b.getAccountId()).toBeNull();
  });
});

describe('billing ↔ session', () => {
  it('sign-out clears the cached entitlement (storage and store), keeps the purchase queue', async () => {
    const off = linkBillingToSession();
    fake.on('POST /auth/email/verify', () => ({ status: 200, body: tokenResponse('e') }));
    fake.on('POST /auth/logout', () => ({ status: 204 }));
    await verifyEmailCode('me@x.co', '123456');
    kv.set('billing.entitlement.v1', JSON.stringify({ pro: true }));
    kv.set('billing.queue.v1', '[{"key":"q"}]');
    useBillingStore.setState({ entitlement: { pro: true } as never });
    await signOut();
    off();
    expect(kv.getString('billing.entitlement.v1')).toBeUndefined();
    expect(useBillingStore.getState().entitlement).toBeNull();
    expect(kv.getString('billing.queue.v1')).toBe('[{"key":"q"}]');
    kv.remove('billing.queue.v1');
  });
});
