/**
 * Crash reporting, the PostHog analytics sink and the review-prompt listener, in two steps so
 * nothing heavy sits on the way to the first screen (perf audit A8):
 *
 * 1. `startEarlyObservability()` at module load of app/_layout.tsx: crash reporting only (so a
 *    startup crash is still caught; a no-op without a DSN or when the user opted out), plus a tiny
 *    in-memory buffer as the analytics sink so no event tracked during startup is lost.
 * 2. `startObservability()` after the first screen: creates the PostHog client, wires the review
 *    prompt and replays the buffered events through the real sink.
 *
 * With no keys configured every part is a no-op.
 */
import { activeSession } from '@/features/workout/repo';

import { setAnalyticsSink, type AnalyticsProps } from './analytics';
import { initCrashReporting } from './crash';
import { createPostHogSink } from './posthog';
import { configureReview, onAnalyticsEventForReview, recordFirstOpen } from './review';

/** Startup events kept until the real sink exists (a launch tracks a handful). */
const MAX_BUFFERED = 100;

let early = false;
let started = false;
let buffer: { event: string; props: AnalyticsProps }[] | null = null;

/** Step 1 (module load): crash reporting + a buffering analytics sink. Cheap and idempotent. */
export function startEarlyObservability(): void {
  if (early) return;
  early = true;
  initCrashReporting();
  if (started) return;
  buffer = [];
  setAnalyticsSink((event, props) => {
    if (buffer && buffer.length < MAX_BUFFERED) buffer.push({ event, props });
  });
}

/** Step 2 (after the first screen): PostHog, the review prompt, then replay the buffer. */
export function startObservability(): void {
  if (started) return;
  started = true;
  if (!early) {
    early = true;
    initCrashReporting();
  }
  recordFirstOpen();
  configureReview({
    // Reading the DB before it is ready throws; review.ts then treats that as "busy".
    isWorkoutActive: () => activeSession() != null,
  });
  const posthog = createPostHogSink();
  const sink = (event: string, props: AnalyticsProps) => {
    try {
      posthog?.(event, props);
    } finally {
      onAnalyticsEventForReview(event, props);
    }
  };
  setAnalyticsSink(sink);
  const queued = buffer ?? [];
  buffer = null;
  for (const e of queued) {
    try {
      sink(e.event, e.props);
    } catch {
      // analytics must never break the app
    }
  }
}

export function resetObservabilityForTests(): void {
  early = false;
  started = false;
  buffer = null;
}
