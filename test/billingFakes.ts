import { Platform } from 'react-native';
import type { ProductSubscription } from 'react-native-iap';

import { DEFAULT_PRODUCT_IDS } from '@/features/billing/config';
import type { BillingApi, BillingPlatform, Entitlement } from '@/services/billingApi';
import type { StoreAdapter, StoreError, StorePurchase, SubscriptionRequest } from '@/services/iap';

export const NOW = Date.UTC(2026, 10, 19, 12, 0, 0);
const DAY = 86_400_000;

export const os = (): BillingPlatform => (Platform.OS === 'ios' ? 'ios' : 'android');

export function entitlement(over: Partial<Entitlement> = {}): Entitlement {
  return {
    pro: true,
    plan: 'yearly',
    source: os() === 'ios' ? 'apple' : 'play',
    expiresAt: NOW + 7 * DAY,
    inTrial: true,
    autoRenew: true,
    updatedAt: NOW,
    ...over,
  };
}

/** GBP store prices, as StoreKit / Play would return them for a UK account. */
export const IOS_PRODUCTS = [
  ['weekly', '£3.99', 3.99],
  ['monthly', '£9.99', 9.99],
  ['quarterly', '£18.99', 18.99],
  ['yearly', '£45.99', 45.99],
].map(([plan, displayPrice, price]) => ({
  id: DEFAULT_PRODUCT_IDS.ios[plan as 'yearly'],
  platform: 'ios',
  type: 'subs',
  displayPrice,
  price,
  currency: 'GBP',
  title: String(plan),
  description: '',
  subscriptionGroupIdIOS: '21000001',
  introductoryPricePaymentModeIOS: plan === 'yearly' ? 'free-trial' : 'empty',
  subscriptionOffers:
    plan === 'yearly'
      ? [
          {
            id: 'intro',
            type: 'introductory',
            paymentMode: 'free-trial',
            period: { unit: 'week', value: 1 },
            periodCount: 1,
            displayPrice: '£0.00',
            price: 0,
          },
        ]
      : [],
})) as unknown as ProductSubscription[];

const phase = (
  period: string,
  micros: number,
  formatted: string,
  recurrenceMode: number,
  cycles = 0,
) => ({
  billingPeriod: period,
  priceAmountMicros: String(micros),
  formattedPrice: formatted,
  priceCurrencyCode: 'GBP',
  recurrenceMode,
  billingCycleCount: cycles,
});

const base = (basePlan: string, period: string, micros: number, formatted: string) => ({
  id: basePlan,
  basePlanIdAndroid: basePlan,
  offerTokenAndroid: `tok-${basePlan}`,
  type: 'introductory',
  displayPrice: formatted,
  price: micros / 1e6,
  pricingPhasesAndroid: { pricingPhaseList: [phase(period, micros, formatted, 1)] },
});

export const ANDROID_PRODUCTS = [
  {
    id: 'repwise_pro',
    platform: 'android',
    type: 'subs',
    displayPrice: '£3.99',
    currency: 'GBP',
    title: 'Repwise Pro',
    description: '',
    nameAndroid: 'Repwise Pro',
    subscriptionOffers: [
      base('weekly', 'P1W', 3_990_000, '£3.99'),
      base('monthly', 'P1M', 9_990_000, '£9.99'),
      base('quarterly', 'P3M', 18_990_000, '£18.99'),
      base('yearly', 'P1Y', 45_990_000, '£45.99'),
      {
        id: 'trial-7d',
        basePlanIdAndroid: 'yearly',
        offerTokenAndroid: 'tok-yearly-trial',
        type: 'introductory',
        displayPrice: '£0.00',
        price: 0,
        pricingPhasesAndroid: {
          pricingPhaseList: [phase('P7D', 0, 'Free', 2, 1), phase('P1Y', 45_990_000, '£45.99', 1)],
        },
      },
    ],
  },
] as unknown as ProductSubscription[];

/** In-memory store with the same seam as the react-native-iap adapter. */
export class FakeStore implements StoreAdapter {
  readonly platform = os();
  log: string[] = [];
  connected = false;
  connectResult = true;
  products: ProductSubscription[] = this.platform === 'ios' ? IOS_PRODUCTS : ANDROID_PRODUCTS;
  eligible = true;
  available: StorePurchase[] = [];
  requests: SubscriptionRequest[] = [];
  finished: StorePurchase[] = [];
  /** What requestSubscription "returns" through the listeners. */
  next: ((req: SubscriptionRequest) => StorePurchase | StoreError) | null = null;
  private purchaseCbs = new Set<(p: StorePurchase) => void>();
  private errorCbs = new Set<(e: StoreError) => void>();

  connect = jest.fn(async () => {
    this.log.push('connect');
    this.connected = this.connectResult;
    return this.connectResult;
  });
  disconnect = jest.fn(async () => {
    this.connected = false;
  });
  fetchSubscriptions = jest.fn(async (skus: string[]) => {
    this.log.push(`fetch:${skus.join(',')}`);
    return this.products.filter((p) => skus.includes(p.id));
  });
  introEligible = jest.fn(async () => this.eligible);
  requestSubscription = jest.fn(async (req: SubscriptionRequest) => {
    this.log.push(`request:${req.sku}`);
    this.requests.push(req);
    const r = this.next?.(req);
    if (!r) return;
    // microtask, not setTimeout: expo-router's renderRouter turns on fake timers
    void Promise.resolve().then(() => ('kind' in r ? this.emitError(r) : this.emitPurchase(r)));
  });
  finish = jest.fn(async (p: StorePurchase) => {
    this.log.push(`finish:${p.transactionId}`);
    this.finished.push(p);
  });
  getAvailablePurchases = jest.fn(async ({ sync }: { sync: boolean }) => {
    this.log.push(`available:${sync}`);
    return this.available;
  });
  onPurchase(cb: (p: StorePurchase) => void) {
    this.purchaseCbs.add(cb);
    return () => this.purchaseCbs.delete(cb);
  }
  onError(cb: (e: StoreError) => void) {
    this.errorCbs.add(cb);
    return () => this.errorCbs.delete(cb);
  }
  emitPurchase(p: StorePurchase) {
    this.purchaseCbs.forEach((cb) => cb(p));
  }
  emitError(e: StoreError) {
    this.errorCbs.forEach((cb) => cb(e));
  }
}

/** A purchase as the store reports it on this platform. */
export function storePurchase(over: Partial<StorePurchase> = {}): StorePurchase {
  return os() === 'ios'
    ? {
        platform: 'ios',
        productId: DEFAULT_PRODUCT_IDS.ios.yearly,
        transactionId: '2000000123',
        token: 'eyJhbGciOiJFUzI1NiJ9.jws.sig',
        state: 'purchased',
        ...over,
      }
    : {
        platform: 'android',
        productId: 'repwise_pro',
        transactionId: 'GPA.1234-5678',
        token: 'play-token-abc',
        state: 'purchased',
        acknowledged: false,
        ...over,
      };
}

export type MockApi = jest.Mocked<BillingApi> & { log: string[] };

export function mockApi(opts: { enabled?: boolean; ent?: Entitlement } = {}): MockApi {
  const log: string[] = [];
  const api = {
    log,
    getConfig: jest.fn(async () => {
      log.push('config');
      return { payments_enabled: opts.enabled ?? true, plans: DEFAULT_PRODUCT_IDS };
    }),
    verifyPurchase: jest.fn(async (body) => {
      log.push(`verify:${body.platform}`);
      return opts.ent ?? entitlement();
    }),
    getEntitlement: jest.fn(async () => {
      log.push('entitlement');
      return (
        opts.ent ??
        entitlement({
          pro: false,
          plan: null,
          source: null,
          expiresAt: null,
          inTrial: false,
          autoRenew: false,
        })
      );
    }),
    getAccountId: jest.fn(async () => '0196a0b2-7c1d-7e3f-8a4b-123456789abc'),
  } as MockApi;
  return api;
}
