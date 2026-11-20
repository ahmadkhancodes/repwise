/**
 * Background services started once the local database is ready. Everything here is
 * fire-and-forget: the UI never waits on the network.
 *
 * Startup order (perf audit A8):
 * 1. Now: the planner bridge and week keeper (local, already deferred to after the first frame) and
 *    the auth restore (one async secure-store read; it sets the owner of rows written from now on).
 * 2. After the first screen (`BACKGROUND_DELAY_MS`): billing (IAP module + Worker), sync and the
 *    catalogue warm-up. Their modules are `require`d only then, so evaluating them never sits
 *    between launch and the first screen. Each still waits for the auth restore.
 */
import { registerPlannerBridge, startPlanKeeper } from '@/features/planner/bridge';

import { initAuth } from './auth';

/** Long enough for Today to paint and settle; short enough that sync and billing feel immediate. */
export const BACKGROUND_DELAY_MS = 1500;

let started = false;
let timer: ReturnType<typeof setTimeout> | null = null;

/* eslint-disable @typescript-eslint/no-require-imports -- deferred module evaluation is the point */
function startDeferred(auth: Promise<void>): void {
  void auth.then(() => {
    try {
      startBillingAndSync();
    } catch {
      // never break the app from a background service
    }
  });
  const { warmCatalog } = require('./catalog') as typeof import('./catalog');
  warmCatalog();
}

function startBillingAndSync(): void {
  // Billing reads its cached flag + entitlement, then talks to the Worker in the background.
  const { configureBilling } = require('./billing') as typeof import('./billing');
  const { createWorkerBillingApi } = require('./billingApi') as typeof import('./billingApi');
  const { linkBillingToSession } = require('./billingSession') as typeof import('./billingSession');
  const { startSync } = require('@/sync') as typeof import('@/sync');
  void configureBilling({ api: createWorkerBillingApi() }).init();
  linkBillingToSession();
  startSync();
}
/* eslint-enable @typescript-eslint/no-require-imports */

export function startBackgroundServices(delayMs: number = BACKGROUND_DELAY_MS): void {
  if (started) return;
  started = true;
  // Check-in / assistant → planner service (local engine; no network needed).
  registerPlannerBridge();
  // Plan each new week as it starts (start-up, foreground, midnight); local only.
  startPlanKeeper();
  const auth = initAuth().catch(() => undefined);
  timer = setTimeout(() => {
    timer = null;
    try {
      startDeferred(auth);
    } catch {
      // a background service must never break the app
    }
  }, delayMs);
}

/** Tests only. */
export function resetBootstrapForTests(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  started = false;
}
