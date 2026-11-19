import { resetAnalyticsForTests, track } from '../analytics';
import { resetObservabilityForTests, startObservability } from '../observability';
import * as review from '../review';

jest.mock('@/features/workout/repo', () => ({ activeSession: jest.fn(() => undefined) }));

beforeEach(() => {
  delete process.env.EXPO_PUBLIC_POSTHOG_KEY;
  delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  resetObservabilityForTests();
  resetAnalyticsForTests();
  review.resetReviewForTests();
});

it('starts with no keys and routes success events to the review prompt', () => {
  const spy = jest.spyOn(review, 'onAnalyticsEventForReview').mockImplementation(() => undefined);
  expect(() => startObservability()).not.toThrow();
  expect(review.loadReviewState().firstOpenAt).not.toBeNull();
  track('workout_finished', { sets: 3 });
  expect(spy).toHaveBeenCalledWith('workout_finished', { sets: 3 });
  spy.mockRestore();
});

it('is idempotent', () => {
  startObservability();
  const first = review.loadReviewState().firstOpenAt;
  startObservability();
  expect(review.loadReviewState().firstOpenAt).toBe(first);
});
