/**
 * Starts crash reporting, the PostHog analytics sink and the review-prompt listener.
 * Called once at module load of app/_layout.tsx (before the first render, so early crashes are
 * caught). With no keys configured every part is a no-op.
 */
import { activeSession } from '@/features/workout/repo';

import { setAnalyticsSink } from './analytics';
import { initCrashReporting } from './crash';
import { createPostHogSink } from './posthog';
import { configureReview, onAnalyticsEventForReview, recordFirstOpen } from './review';

let started = false;

export function startObservability(): void {
  if (started) return;
  started = true;
  initCrashReporting();
  recordFirstOpen();
  configureReview({
    // Reading the DB before it is ready throws; review.ts then treats that as "busy".
    isWorkoutActive: () => activeSession() != null,
  });
  const posthog = createPostHogSink();
  setAnalyticsSink((event, props) => {
    try {
      posthog?.(event, props);
    } finally {
      onAnalyticsEventForReview(event, props);
    }
  });
}

export function resetObservabilityForTests(): void {
  started = false;
}
