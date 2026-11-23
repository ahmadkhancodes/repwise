import { useEffect, useState } from 'react';

import { proGate, useBillingStore } from '@/services/billing';
import type { Entitlement } from '@/services/billingApi';
import { useDemoPayments, type DemoEntitlement } from '@/services/demoPayments';

export type ProState = {
  /** The gate for Pro features: true for everyone while payments are off. */
  isPro: boolean;
  /** A real, Worker-verified subscription (cached with offline grace). */
  subscribed: boolean;
  paymentsEnabled: boolean;
  entitlement: Entitlement | null;
  /** Demo builds only: Pro comes from a local TEST purchase (D-DEMO-PAY). Never in production. */
  demo: DemoEntitlement | null;
};

/** Wall clock that ticks once a minute, so an entitlement expiring while open is noticed. */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * Pro comes ONLY from the Worker entitlement (cached in MMKV). Never from the store
 * library and never from a local flag. With `payments_enabled` off nobody is gated.
 * The one exception is the demo TEST purchase, compiled out of production builds (D-DEMO-PAY).
 */
export function usePro(nowOverride?: number): ProState {
  const clock = useMinuteClock();
  const now = nowOverride ?? clock;
  const paymentsEnabled = useBillingStore((s) => s.paymentsEnabled);
  const entitlement = useBillingStore((s) => s.entitlement);
  const demoOn = useDemoPayments((s) => s.on);
  const demoEnt = useDemoPayments((s) => s.entitlement);
  const g = proGate(paymentsEnabled, entitlement, demoOn, demoEnt, now);
  return {
    isPro: g.isPro,
    subscribed: g.subscribed,
    paymentsEnabled: g.paymentsOn,
    entitlement,
    demo: g.demo ? demoEnt : null,
  };
}
