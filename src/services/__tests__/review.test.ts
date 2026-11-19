import { resetAnalyticsForTests, trackedEvents } from '../analytics';
import {
  configureReview,
  loadReviewState,
  maybeAskForReview,
  onAnalyticsEventForReview,
  recordFirstOpen,
  resetReviewForTests,
  REVIEW_DELAY_MS,
  reviewBlock,
  reviewTriggerForEvent,
} from '../review';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 10, 1);

function fakeStore(available = true) {
  return {
    isAvailableAsync: jest.fn(async () => available),
    hasAction: jest.fn(async () => true),
    requestReview: jest.fn(async () => undefined),
  };
}

let now = T0;
let store = fakeStore();
let workoutActive = false;

beforeEach(() => {
  resetReviewForTests();
  resetAnalyticsForTests();
  now = T0;
  store = fakeStore();
  workoutActive = false;
  configureReview({ now: () => now, storeReview: () => store, isWorkoutActive: () => workoutActive });
});

describe('reviewBlock (pure rules)', () => {
  const ok = { workoutActive: false };
  it('needs a first open and 3 quiet days', () => {
    expect(reviewBlock({ firstOpenAt: null, asks: [] }, T0, ok)).toBe('no_first_open');
    expect(reviewBlock({ firstOpenAt: T0, asks: [] }, T0 + 3 * DAY - 1, ok)).toBe('too_early');
    expect(reviewBlock({ firstOpenAt: T0, asks: [] }, T0 + 3 * DAY, ok)).toBeNull();
  });
  it('never during a workout', () => {
    expect(reviewBlock({ firstOpenAt: T0, asks: [] }, T0 + 10 * DAY, { workoutActive: true })).toBe('workout_active');
  });
  it('caps at 3 per rolling year with a 30-day gap', () => {
    const s = { firstOpenAt: T0, asks: [T0 + 5 * DAY] };
    expect(reviewBlock(s, T0 + 34 * DAY, ok)).toBe('cooldown');
    expect(reviewBlock(s, T0 + 35 * DAY, ok)).toBeNull();
    const three = { firstOpenAt: T0, asks: [T0 + 5 * DAY, T0 + 40 * DAY, T0 + 80 * DAY] };
    expect(reviewBlock(three, T0 + 200 * DAY, ok)).toBe('yearly_cap');
    expect(reviewBlock(three, T0 + 5 * DAY + 365 * DAY, ok)).toBeNull();
  });
});

describe('maybeAskForReview', () => {
  it('does nothing in the first 3 days', async () => {
    recordFirstOpen(T0);
    now = T0 + 2 * DAY;
    expect(await maybeAskForReview('workout_finished')).toBe(false);
    expect(store.requestReview).not.toHaveBeenCalled();
  });

  it('asks after a success moment, records it and tracks review_prompt', async () => {
    recordFirstOpen(T0);
    recordFirstOpen(T0 + DAY); // first open is kept
    expect(loadReviewState().firstOpenAt).toBe(T0);
    now = T0 + 4 * DAY;
    expect(await maybeAskForReview('checkin_done')).toBe(true);
    expect(store.requestReview).toHaveBeenCalledTimes(1);
    expect(loadReviewState().asks).toEqual([now]);
    expect(trackedEvents().at(-1)).toEqual({ event: 'review_prompt', props: { moment: 'checkin_done' } });
  });

  it('asks at most 3 times a year', async () => {
    recordFirstOpen(T0);
    let asked = 0;
    for (let d = 4; d < 365; d += 31) {
      now = T0 + d * DAY;
      if (await maybeAskForReview('workout_finished')) asked += 1;
    }
    expect(asked).toBe(3);
  });

  it('never asks during a workout, or when the workout state is unknown', async () => {
    recordFirstOpen(T0);
    now = T0 + 10 * DAY;
    workoutActive = true;
    expect(await maybeAskForReview('pr')).toBe(false);
    configureReview({
      isWorkoutActive: () => {
        throw new Error('db not ready');
      },
    });
    expect(await maybeAskForReview('pr')).toBe(false);
    expect(store.requestReview).not.toHaveBeenCalled();
  });

  it('does not count an ask when the store sheet is unavailable', async () => {
    recordFirstOpen(T0);
    now = T0 + 10 * DAY;
    store = fakeStore(false);
    expect(await maybeAskForReview('streak_milestone')).toBe(false);
    expect(loadReviewState().asks).toEqual([]);
  });

  it('never throws when the native module fails', async () => {
    recordFirstOpen(T0);
    now = T0 + 10 * DAY;
    configureReview({
      storeReview: () => {
        throw new Error('missing');
      },
    });
    await expect(maybeAskForReview('week_complete')).resolves.toBe(false);
  });
});

describe('success events from analytics', () => {
  it('maps sheet-23 success events to triggers', () => {
    expect(reviewTriggerForEvent('workout_finished', { sets: 12 })).toBe('workout_finished');
    expect(reviewTriggerForEvent('workout_finished', { sets: 0 })).toBeNull();
    expect(reviewTriggerForEvent('checkin_done', {})).toBe('checkin_done');
    expect(reviewTriggerForEvent('meal_logged', {})).toBeNull();
  });

  it('asks after the celebration delay', async () => {
    jest.useFakeTimers();
    try {
      recordFirstOpen(T0);
      now = T0 + 10 * DAY;
      onAnalyticsEventForReview('workout_finished', { sets: 10 });
      onAnalyticsEventForReview('set_logged', {});
      expect(store.isAvailableAsync).not.toHaveBeenCalled();
      jest.advanceTimersByTime(REVIEW_DELAY_MS);
    } finally {
      jest.useRealTimers();
    }
    await new Promise<void>((r) => setImmediate(() => r()));
    expect(store.requestReview).toHaveBeenCalledTimes(1);
  });
});
