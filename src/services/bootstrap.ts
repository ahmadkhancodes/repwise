/**
 * Background services started once the local database is ready. Everything here is
 * fire-and-forget: the UI never waits on the network.
 *
 * Startup order (perf audit A8, r2 N1):
 * 1. Now: the auth restore (one async secure-store read; it sets the owner of rows written from now
 *    on).
 * 2. Right after the first frame (`afterFirstFrame`): the planner bridge and week keeper. Their
 *    module (planner service + engine + zod schemas) is `require`d only then; a static import here
 *    put it on the root layout's import chain, before the first frame.
 * 3. After the first screen (`BACKGROUND_DELAY_MS`): billing (IAP module + Worker), sync and the
 *    catalogue warm-up, `require`d only then. Each still waits for the auth restore.
 */
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

function startPlanner(): void {
  const { registerPlannerBridge, startPlanKeeper } =
    require('@/features/planner/bridge') as typeof import('@/features/planner/bridge');
  // Check-in / assistant → planner service (local engine; no network needed). Until it registers,
  // Today's planner seam degrades gracefully (today/plannerBridge.ts).
  registerPlannerBridge();
  // Plan each new week as it starts (start-up, foreground, midnight); local only.
  startPlanKeeper();
}

/** Run `fn` once the next frame has painted (rAF fires before the paint; the timeout after it). */
export function afterFirstFrame(fn: () => void): void {
  const raf = (globalThis as { requestAnimationFrame?: (cb: () => void) => unknown })
    .requestAnimationFrame;
  const later = () => {
    setTimeout(() => {
      try {
        fn();
      } catch {
        // a background service must never break the app
      }
    }, 0);
  };
  if (typeof raf === 'function') raf(later);
  else later();
}
/* eslint-enable @typescript-eslint/no-require-imports */

export function startBackgroundServices(delayMs: number = BACKGROUND_DELAY_MS): void {
  if (started) return;
  started = true;
  afterFirstFrame(startPlanner);
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
