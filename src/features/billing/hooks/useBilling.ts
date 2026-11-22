import { useCallback } from 'react';

import {
  billing,
  useBillingStore,
  type PurchaseOutcome,
  type RestoreOutcome,
} from '@/services/billing';
import type { PlanId } from '@/services/billingApi';
import { demoCheckoutActive, useDemoPayments } from '@/services/demoPayments';

import type { PlanOffer } from '../logic/offers';

/** Demo checkout: the USD plans are buyable as-is (no store to localise them). Pure. */
export function demoOffers(offers: readonly PlanOffer[]): PlanOffer[] {
  return offers.map((o) => (o.localised ? o : { ...o, localised: true }));
}

/** Paywall + subscription screen state and actions. UI never touches the service directly. */
export function useBilling() {
  const storeOffers = useBillingStore((s) => s.offers);
  const demoState = useDemoPayments();
  const demoCheckout = demoCheckoutActive(demoState);
  const productsStatus = useBillingStore((s) => s.productsStatus);
  const storeStatus = useBillingStore((s) => s.storeStatus);
  const purchasing = useBillingStore((s) => s.purchasing);
  const restoring = useBillingStore((s) => s.restoring);
  const paymentsEnabled = useBillingStore((s) => s.paymentsEnabled) || demoCheckout;
  const offers = demoCheckout ? demoOffers(storeOffers) : storeOffers;
  const pendingVerifications = useBillingStore((s) => s.queue.length);

  const purchase = useCallback(
    (plan: PlanId): Promise<PurchaseOutcome> => billing().purchase(plan),
    [],
  );
  const restore = useCallback((): Promise<RestoreOutcome> => billing().restore(), []);
  const reloadProducts = useCallback(() => billing().loadProducts(), []);
  const openManage = useCallback(() => billing().openManage(), []);

  return {
    platform: billing().platform,
    offers,
    productsStatus,
    storeStatus,
    purchasing,
    restoring,
    paymentsEnabled,
    /** Demo builds only: "Start free trial" opens the TEST checkout instead of the store. */
    demoCheckout,
    pendingVerifications,
    purchase,
    restore,
    reloadProducts,
    openManage,
  };
}

/** Open the paywall only when payments are on (otherwise it is a no-op). */
export function canOpenPaywall(): boolean {
  return useBillingStore.getState().paymentsEnabled || demoCheckoutActive();
}
