/* eslint-disable @typescript-eslint/no-require-imports */
import { Platform } from 'react-native';
import type * as RNIap from 'react-native-iap';

import type { BillingPlatform } from './billingApi';

type ProductSubscription = RNIap.ProductSubscription;
type Purchase = RNIap.Purchase;

/** A store purchase, normalised across StoreKit 2 and Play Billing. */
export type StorePurchase = {
  platform: BillingPlatform;
  productId: string;
  /** iOS: transaction id (needed to finish). Android: order id, or the token. */
  transactionId: string;
  /** iOS: StoreKit 2 JWS (`signedTransaction`). Android: purchase token. */
  token: string;
  state: 'purchased' | 'pending' | 'unknown';
  /** Android only: already acknowledged (finished) on Play. */
  acknowledged?: boolean;
};

export type StoreErrorKind =
  'cancelled' | 'pending' | 'already_owned' | 'network' | 'unavailable' | 'other';
export type StoreError = {
  kind: StoreErrorKind;
  code: string;
  message: string;
  productId?: string;
};

export type SubscriptionRequest = {
  sku: string;
  /** Android: the base-plan offer token. */
  offerToken?: string;
  /** Server user id → StoreKit appAccountToken (uuid) / Play obfuscatedAccountId. */
  accountId?: string | null;
};

/**
 * Thin seam over the store library so billing logic is testable with a fake. The only file
 * that imports `react-native-iap` at runtime. Swapping to another OpenIAP library (e.g.
 * `expo-iap`, same API) only touches this file.
 */
export interface StoreAdapter {
  readonly platform: BillingPlatform;
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  fetchSubscriptions(skus: string[]): Promise<ProductSubscription[]>;
  /** iOS: StoreKit intro-offer eligibility for the group. Android: true (Play filters offers). */
  introEligible(products: ProductSubscription[]): Promise<boolean>;
  requestSubscription(req: SubscriptionRequest): Promise<void>;
  /** Finish (iOS) / acknowledge (Android). Call ONLY after the Worker verified the purchase. */
  finish(p: StorePurchase): Promise<void>;
  /** Active purchases. `sync: true` (Restore button) asks the App Store to sync first. */
  getAvailablePurchases(opts: { sync: boolean }): Promise<StorePurchase[]>;
  onPurchase(cb: (p: StorePurchase) => void): () => void;
  onError(cb: (e: StoreError) => void): () => void;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pure: map a react-native-iap purchase to ours. iOS JWS falls back to `getTransactionJwsIOS`. */
export function normalizePurchase(p: Purchase, platform: BillingPlatform): StorePurchase {
  const token = p.purchaseToken ?? '';
  const transactionId =
    platform === 'ios'
      ? p.id
      : ((p as { transactionId?: string | null }).transactionId ?? p.id ?? token);
  return {
    platform,
    productId: p.productId,
    transactionId: transactionId || token,
    token,
    state:
      p.purchaseState === 'purchased'
        ? 'purchased'
        : p.purchaseState === 'pending'
          ? 'pending'
          : 'unknown',
    ...(platform === 'android'
      ? {
          acknowledged: Boolean(
            (p as { isAcknowledgedAndroid?: boolean | null }).isAcknowledgedAndroid,
          ),
        }
      : {}),
  };
}

/** Pure: store error → what the UI needs to know. */
export function classifyStoreError(err: unknown): StoreError {
  const e = (err ?? {}) as { code?: unknown; message?: unknown; productId?: unknown };
  const code = typeof e.code === 'string' ? e.code : 'unknown';
  const kind: StoreErrorKind =
    code === 'user-cancelled'
      ? 'cancelled'
      : code === 'pending' || code === 'deferred-payment'
        ? 'pending'
        : code === 'already-owned'
          ? 'already_owned'
          : code === 'network-error' ||
              code === 'service-timeout' ||
              code === 'service-disconnected'
            ? 'network'
            : code === 'iap-not-available' ||
                code === 'billing-unavailable' ||
                code === 'init-connection'
              ? 'unavailable'
              : 'other';
  return {
    kind,
    code,
    message: typeof e.message === 'string' ? e.message : code,
    productId: typeof e.productId === 'string' ? e.productId : undefined,
  };
}

/** Pure: the per-platform request body for `requestPurchase({ type: 'subs' })`. */
export function subscriptionRequestProps(platform: BillingPlatform, req: SubscriptionRequest) {
  if (platform === 'ios') {
    return {
      apple: {
        sku: req.sku,
        // StoreKit requires a UUID; our server ids are uuid v7.
        ...(req.accountId && UUID.test(req.accountId)
          ? { appAccountToken: req.accountId.toLowerCase() }
          : {}),
        andDangerouslyFinishTransactionAutomatically: false,
      },
    };
  }
  return {
    google: {
      skus: [req.sku],
      ...(req.offerToken
        ? { subscriptionOffers: [{ sku: req.sku, offerToken: req.offerToken }] }
        : {}),
      ...(req.accountId ? { obfuscatedAccountId: req.accountId.slice(0, 64) } : {}),
    },
  };
}

/** The real adapter. `react-native-iap` is required lazily so nothing loads it while payments are off. */
export function createIapAdapter(): StoreAdapter {
  const platform: BillingPlatform = Platform.OS === 'ios' ? 'ios' : 'android';
  let lib: typeof RNIap | null = null;
  const iap = (): typeof RNIap => (lib ??= require('react-native-iap') as typeof RNIap);

  const withJws = async (p: Purchase): Promise<StorePurchase> => {
    const n = normalizePurchase(p, platform);
    if (platform === 'ios' && !n.token) {
      n.token = (await iap().getTransactionJwsIOS(p.productId)) ?? '';
    }
    return n;
  };

  return {
    platform,
    connect: async () => Boolean(await iap().initConnection()),
    disconnect: async () => {
      if (lib) await lib.endConnection();
    },
    fetchSubscriptions: async (skus) =>
      ((await iap().fetchProducts({ skus, type: 'subs' })) ?? []) as ProductSubscription[],
    introEligible: async (products) => {
      if (platform !== 'ios') return true;
      const group = products.find((p) => p.platform === 'ios' && p.subscriptionGroupIdIOS);
      const id = group?.platform === 'ios' ? group.subscriptionGroupIdIOS : null;
      if (!id) return false;
      try {
        return await iap().isEligibleForIntroOfferIOS(id);
      } catch {
        return false; // never promise a trial we are not sure about
      }
    },
    requestSubscription: async (req) => {
      await iap().requestPurchase({
        type: 'subs',
        request: subscriptionRequestProps(platform, req),
      });
    },
    finish: async (p) => {
      const minimal =
        platform === 'ios'
          ? { id: p.transactionId, productId: p.productId }
          : { id: p.transactionId, productId: p.productId, purchaseToken: p.token };
      await iap().finishTransaction({
        purchase: minimal as unknown as Purchase,
        isConsumable: false,
      });
    },
    getAvailablePurchases: async ({ sync }) => {
      if (sync && platform === 'ios') await iap().restorePurchases();
      const list = await iap().getAvailablePurchases({ onlyIncludeActiveItemsIOS: true });
      return Promise.all((list ?? []).map(withJws));
    },
    onPurchase: (cb) => {
      const sub = iap().purchaseUpdatedListener((p) => {
        withJws(p).then(cb, () => cb(normalizePurchase(p, platform)));
      });
      return () => sub.remove();
    },
    onError: (cb) => {
      const sub = iap().purchaseErrorListener((e) => cb(classifyStoreError(e)));
      return () => sub.remove();
    },
  };
}
