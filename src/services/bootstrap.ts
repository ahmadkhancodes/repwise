/**
 * Background services started once the local database is ready. Everything here is
 * fire-and-forget: the UI never waits on the network.
 */
import { registerPlannerBridge, startPlanKeeper } from '@/features/planner/bridge';
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
  // Check-in / assistant → planner service (local engine; no network needed).
  registerPlannerBridge();
  // Plan each new week as it starts (start-up, foreground, midnight); local only.
  startPlanKeeper();
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
