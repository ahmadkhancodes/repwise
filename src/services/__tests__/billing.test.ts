import { Platform } from 'react-native';

import { BillingService, initialBillingState, isProNow, useBillingStore } from '@/services/billing';
import { BillingApiError } from '@/services/billingApi';
import { kv } from '@/services/storage';

import {
  FakeStore,
  entitlement,
  mockApi,
  NOW,
  os,
  storePurchase,
  type MockApi,
} from '../../../test/billingFakes';

const KEYS = [
  'billing.paymentsEnabled.v1',
  'billing.productIds.v1',
  'billing.entitlement.v1',
  'billing.queue.v1',
];

let store: FakeStore;
let api: MockApi;
let svc: BillingService;
let clock = NOW;

function setup(opts: Parameters<typeof mockApi>[0] = {}) {
  api = mockApi(opts);
  store = new FakeStore();
  store.log = api.log; // one ordered log for api + store calls
  svc = new BillingService({ api, store, now: () => clock, openUrl: jest.fn(async () => true) });
  return svc;
}

beforeEach(() => {
  KEYS.forEach((k) => kv.remove(k));
  useBillingStore.setState(initialBillingState(), true);
  clock = NOW;
});

afterEach(async () => {
  await svc?.teardown();
});

describe(`billing service (${Platform.OS})`, () => {
  it('payments off: nobody gated, store never touched, paywall actions are no-ops', async () => {
    setup({ enabled: false });
    await svc.init();
    expect(store.connect).not.toHaveBeenCalled();
    expect(store.fetchSubscriptions).not.toHaveBeenCalled();
    expect(await svc.purchase('yearly')).toEqual({ status: 'disabled' });
    expect(await svc.restore()).toEqual({ status: 'disabled' });
    expect(store.getAvailablePurchases).not.toHaveBeenCalled();
    expect(isProNow(clock)).toBe(true);
    expect(api.getEntitlement).not.toHaveBeenCalled();
  });

  it('no BillingApi configured: payments stay off', async () => {
    store = new FakeStore();
    svc = new BillingService({ api: null, store });
    await svc.init();
    expect(useBillingStore.getState().paymentsEnabled).toBe(false);
    expect(store.connect).not.toHaveBeenCalled();
  });

  it('payments on: connects, loads localised products, reads the entitlement', async () => {
    setup();
    await svc.init();
    const s = useBillingStore.getState();
    expect(s.paymentsEnabled).toBe(true);
    expect(s.storeStatus).toBe('ready');
    expect(s.productsStatus).toBe('ready');
    expect(s.offers.map((o) => o.price)).toEqual(['£45.99', '£18.99', '£9.99', '£3.99']);
    expect(s.offers[0]!.trialDays).toBe(7);
    expect(api.getEntitlement).toHaveBeenCalled();
    expect(kv.getString('billing.paymentsEnabled.v1')).toBe('1');
    if (os() === 'ios') {
      expect(store.fetchSubscriptions).toHaveBeenCalledWith(
        expect.arrayContaining(['com.client.repwise.pro.yearly']),
      );
    } else {
      expect(store.fetchSubscriptions).toHaveBeenCalledWith(['repwise_pro']);
    }
  });

  it('purchase: request → /billing/verify → finish (finish only after verify)', async () => {
    setup();
    await svc.init();
    store.next = () => storePurchase();
    const out = await svc.purchase('yearly');
    expect(out).toEqual({ status: 'pro' });

    const req = store.requests[0]!;
    if (os() === 'ios') {
      expect(req).toEqual({
        sku: 'com.client.repwise.pro.yearly',
        offerToken: undefined,
        accountId: expect.any(String),
      });
      expect(api.verifyPurchase).toHaveBeenCalledWith({
        platform: 'ios',
        signedTransaction: 'eyJhbGciOiJFUzI1NiJ9.jws.sig',
      });
    } else {
      // Yearly buys the 7-day trial offer of the yearly base plan.
      expect(req).toEqual({
        sku: 'repwise_pro',
        offerToken: 'tok-yearly-trial',
        accountId: expect.any(String),
      });
      expect(api.verifyPurchase).toHaveBeenCalledWith({
        platform: 'android',
        purchaseToken: 'play-token-abc',
        productId: 'repwise_pro',
      });
    }
    const order = api.log.filter((l) => /^(request|verify|finish)/.test(l));
    expect(order).toEqual([
      expect.stringMatching(/^request:/),
      `verify:${os()}`,
      `finish:${storePurchase().transactionId}`,
    ]);
    expect(useBillingStore.getState().queue).toEqual([]);
    expect(isProNow(clock)).toBe(true);
    expect(JSON.parse(kv.getString('billing.entitlement.v1')!).pro).toBe(true);
  });

  it('a non-trial plan buys its plain base plan', async () => {
    setup();
    await svc.init();
    store.next = () =>
      storePurchase({
        productId: os() === 'ios' ? 'com.client.repwise.pro.monthly' : 'repwise_pro',
      });
    await svc.purchase('monthly');
    expect(store.requests[0]!.offerToken).toBe(os() === 'ios' ? undefined : 'tok-monthly');
  });

  it('verify offline: transaction stays unfinished and queued, then retried', async () => {
    setup();
    await svc.init();
    api.verifyPurchase.mockRejectedValueOnce(new TypeError('Network request failed'));
    store.next = () => storePurchase();
    expect(await svc.purchase('yearly')).toEqual({ status: 'queued' });
    expect(store.finish).not.toHaveBeenCalled();
    const q = useBillingStore.getState().queue;
    expect(q).toHaveLength(1);
    expect(q[0]!.attempts).toBe(1);
    expect(JSON.parse(kv.getString('billing.queue.v1')!)).toHaveLength(1); // survives a restart

    clock += 10_000; // past the 5 s backoff
    await svc.flushQueue();
    expect(api.verifyPurchase).toHaveBeenCalledTimes(2);
    expect(store.finish).toHaveBeenCalledTimes(1);
    expect(useBillingStore.getState().queue).toEqual([]);
  });

  it('queued purchases from a previous run are verified on start', async () => {
    setup();
    // previous run: verify failed
    await svc.init();
    api.verifyPurchase.mockRejectedValueOnce(new BillingApiError(503, 'unavailable'));
    store.next = () => storePurchase();
    await svc.purchase('yearly');
    await svc.teardown();

    // next launch
    useBillingStore.setState(initialBillingState(), true);
    expect(useBillingStore.getState().queue).toHaveLength(1);
    const api2 = mockApi();
    const store2 = new FakeStore();
    const svc2 = new BillingService({ api: api2, store: store2, now: () => clock });
    await svc2.init();
    expect(api2.verifyPurchase).toHaveBeenCalledTimes(1);
    expect(store2.finish).toHaveBeenCalledTimes(1);
    expect(useBillingStore.getState().queue).toEqual([]);
    await svc2.teardown();
  });

  it('a permanent rejection is not finished and not retried forever', async () => {
    setup();
    await svc.init();
    api.verifyPurchase.mockRejectedValueOnce(new BillingApiError(400, 'invalid_purchase'));
    store.next = () => storePurchase();
    expect(await svc.purchase('yearly')).toEqual({ status: 'error', code: 'rejected' });
    expect(store.finish).not.toHaveBeenCalled();
    expect(useBillingStore.getState().queue).toEqual([]);
  });

  it('user cancel: no verify, no finish', async () => {
    setup();
    await svc.init();
    store.next = () => ({ kind: 'cancelled', code: 'user-cancelled', message: 'cancelled' });
    expect(await svc.purchase('yearly')).toEqual({ status: 'cancelled' });
    expect(api.verifyPurchase).not.toHaveBeenCalled();
    expect(useBillingStore.getState().purchasing).toBeNull();
  });

  it('pending payment (slow card / Ask to Buy): not verified until purchased', async () => {
    setup();
    await svc.init();
    store.next = () => storePurchase({ state: 'pending' });
    expect(await svc.purchase('yearly')).toEqual({ status: 'pending' });
    expect(api.verifyPurchase).not.toHaveBeenCalled();
    // later the store reports it purchased
    store.emitPurchase(storePurchase());
    await new Promise((r) => setTimeout(r, 0));
    expect(api.verifyPurchase).toHaveBeenCalledTimes(1);
    expect(store.finish).toHaveBeenCalledTimes(1);
  });

  it('ignores purchases of other products', async () => {
    setup();
    await svc.init();
    store.emitPurchase(storePurchase({ productId: 'someone.else' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(api.verifyPurchase).not.toHaveBeenCalled();
  });

  it('restore: syncs the store, verifies active purchases, re-reads the entitlement', async () => {
    setup({ ent: entitlement() });
    await svc.init();
    store.available = [storePurchase({ acknowledged: true })];
    expect(await svc.restore()).toEqual({ status: 'restored' });
    expect(store.getAvailablePurchases).toHaveBeenCalledWith({ sync: true });
    expect(api.verifyPurchase).toHaveBeenCalledTimes(1);
    expect(store.finish).toHaveBeenCalledTimes(1);
    expect(api.log.lastIndexOf('entitlement')).toBeGreaterThan(api.log.indexOf(`verify:${os()}`));
  });

  it('restore with no store purchases still finds Pro bought on the other platform', async () => {
    setup({ ent: entitlement({ source: os() === 'ios' ? 'play' : 'apple' }) });
    await svc.init();
    store.available = [];
    expect(await svc.restore()).toEqual({ status: 'restored' });
    expect(api.verifyPurchase).not.toHaveBeenCalled();
  });

  it('restore with nothing to restore says so', async () => {
    setup();
    await svc.init();
    expect(await svc.restore()).toEqual({ status: 'nothing' });
  });

  it('start-up recovery: Android verifies unacknowledged purchases; iOS waits for StoreKit replay', async () => {
    api = mockApi();
    store = new FakeStore();
    store.available = [storePurchase({ acknowledged: false })];
    svc = new BillingService({ api, store, now: () => clock });
    await svc.init();
    if (os() === 'android') {
      expect(store.getAvailablePurchases).toHaveBeenCalledWith({ sync: false });
      expect(api.verifyPurchase).toHaveBeenCalledTimes(1);
      expect(store.finish).toHaveBeenCalledTimes(1);
    } else {
      expect(store.getAvailablePurchases).not.toHaveBeenCalled();
      expect(api.verifyPurchase).not.toHaveBeenCalled();
      // StoreKit replays the unfinished transaction through the listener:
      store.emitPurchase(storePurchase());
      await new Promise((r) => setTimeout(r, 0));
      expect(api.verifyPurchase).toHaveBeenCalledTimes(1);
      expect(store.finish).toHaveBeenCalledTimes(1);
    }
  });

  it('offline launch keeps the cached flag and entitlement', async () => {
    setup();
    await svc.init();
    store.next = () => storePurchase();
    await svc.purchase('yearly');
    await svc.teardown();

    useBillingStore.setState(initialBillingState(), true);
    const offline = mockApi();
    offline.getConfig.mockRejectedValue(new TypeError('offline'));
    offline.getEntitlement.mockRejectedValue(new TypeError('offline'));
    svc = new BillingService({ api: offline, store: new FakeStore(), now: () => clock });
    await svc.init();
    expect(useBillingStore.getState().paymentsEnabled).toBe(true);
    expect(isProNow(clock)).toBe(true);
  });

  it('products failing to load leave the USD fallback and an error state', async () => {
    setup();
    store.fetchSubscriptions.mockRejectedValueOnce(new Error('store down'));
    await svc.init();
    const s = useBillingStore.getState();
    expect(s.productsStatus).toBe('error');
    expect(s.offers.every((o) => !o.localised)).toBe(true);
    expect(await svc.purchase('yearly')).toEqual({ status: 'error', code: 'products_unavailable' });
  });

  it('iOS hides the trial when StoreKit says the Apple ID is not eligible', async () => {
    setup();
    store.eligible = false;
    await svc.init();
    const yearly = useBillingStore.getState().offers[0]!;
    expect(yearly.trialDays).toBe(os() === 'ios' ? 0 : 7);
  });

  it('Manage opens the store subscriptions page for this platform', async () => {
    const openUrl = jest.fn(async () => true);
    api = mockApi();
    store = new FakeStore();
    svc = new BillingService({ api, store, now: () => clock, openUrl });
    await svc.init();
    await svc.openManage();
    expect(openUrl).toHaveBeenCalledWith(
      os() === 'ios'
        ? 'https://apps.apple.com/account/subscriptions'
        : 'https://play.google.com/store/account/subscriptions?sku=repwise_pro&package=com.client.repwise',
    );
  });
});
