/**
 * Background services started once the local database is ready. Everything here is
 * fire-and-forget: the UI never waits on the network.
 */
import { startSync } from '@/sync';

import { initAuth } from './auth';
import { configureBilling } from './billing';
import { createWorkerBillingApi } from './billingApi';
import { linkBillingToSession } from './billingSession';
import { warmCatalog } from './catalog';

let started = false;

export function startBackgroundServices(): void {
  if (started) return;
  started = true;
  initAuth()
    .catch(() => undefined)
    .then(() => {
      // Billing reads its cached flag + entitlement, then talks to the Worker in the background.
      // `track` is wired when the analytics service (PostHog) lands.
      void configureBilling({ api: createWorkerBillingApi() }).init();
      linkBillingToSession();
      startSync();
    });
  warmCatalog();
}
