import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import {
  DEMO_PAYMENTS_AVAILABLE,
  resetDemoEntitlement,
  setDemoPaymentsOn,
} from '@/services/demoPayments';

/** `?on=1|0&reset=1` → what the demo link does. Pure. */
export function demoLinkAction(params: { on?: string; reset?: string }): {
  on: boolean | null;
  reset: boolean;
} {
  return {
    on: params.on === '1' ? true : params.on === '0' ? false : null,
    reset: params.reset === '1',
  };
}

/**
 * `repwise://demo-payments?on=1[&reset=1]` (D-DEMO-PAY): switch the TEST checkout on for the E2E
 * flows and the client tour, then go home. Production builds ignore it and just go home.
 */
export function DemoPaymentsLink() {
  const params = useLocalSearchParams<{ on?: string; reset?: string }>();
  useEffect(() => {
    if (!DEMO_PAYMENTS_AVAILABLE) return;
    const a = demoLinkAction(params);
    if (a.on !== null) setDemoPaymentsOn(a.on);
    if (a.reset) resetDemoEntitlement();
  }, [params]);
  return <Redirect href="/" />;
}
