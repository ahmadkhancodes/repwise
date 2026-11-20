import { resetAnalyticsForTests, track } from '../analytics';
import {
  resetObservabilityForTests,
  startEarlyObservability,
  startObservability,
} from '../observability';
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

describe('two-step start (perf A8)', () => {
  it('early start buffers analytics; the full start replays them through the real sink', () => {
    const spy = jest.spyOn(review, 'onAnalyticsEventForReview').mockImplementation(() => undefined);
    startEarlyObservability();
    startEarlyObservability(); // idempotent
    track('app_open', { cold: true });
    track('workout_finished', { sets: 3 });
    expect(spy).not.toHaveBeenCalled(); // nothing heavy yet: no review wiring, no PostHog
    expect(review.loadReviewState().firstOpenAt).toBeNull();
    startObservability();
    expect(spy.mock.calls).toEqual([
      ['app_open', { cold: true }],
      ['workout_finished', { sets: 3 }],
    ]);
    track('meal_logged', {});
    expect(spy).toHaveBeenLastCalledWith('meal_logged', {});
    expect(review.loadReviewState().firstOpenAt).not.toBeNull();
    spy.mockRestore();
  });

  it('caps the startup buffer', () => {
    const spy = jest.spyOn(review, 'onAnalyticsEventForReview').mockImplementation(() => undefined);
    startEarlyObservability();
    for (let i = 0; i < 150; i++) track('tick', { i });
    startObservability();
    expect(spy).toHaveBeenCalledTimes(100);
    spy.mockRestore();
  });

  it('early start after the full start keeps the real sink', () => {
    const spy = jest.spyOn(review, 'onAnalyticsEventForReview').mockImplementation(() => undefined);
    startObservability();
    startEarlyObservability();
    track('x', {});
    expect(spy).toHaveBeenCalledWith('x', {});
    spy.mockRestore();
  });
});
