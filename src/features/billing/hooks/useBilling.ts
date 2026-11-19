import { useCallback } from 'react';

import {
  billing,
  useBillingStore,
  type PurchaseOutcome,
  type RestoreOutcome,
} from '@/services/billing';
import type { PlanId } from '@/services/billingApi';

/** Paywall + subscription screen state and actions. UI never touches the service directly. */
export function useBilling() {
  const offers = useBillingStore((s) => s.offers);
  const productsStatus = useBillingStore((s) => s.productsStatus);
  const storeStatus = useBillingStore((s) => s.storeStatus);
  const purchasing = useBillingStore((s) => s.purchasing);
  const restoring = useBillingStore((s) => s.restoring);
  const paymentsEnabled = useBillingStore((s) => s.paymentsEnabled);
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
    pendingVerifications,
    purchase,
    restore,
    reloadProducts,
    openManage,
  };
}

/** Open the paywall only when payments are on (otherwise it is a no-op). */
export function canOpenPaywall(): boolean {
  return useBillingStore.getState().paymentsEnabled;
}
