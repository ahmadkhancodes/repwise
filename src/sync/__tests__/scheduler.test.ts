/** Perf audit r2 N20: no sync push (and settle echo) every 2 s during a workout. */
import { freshDb, plannedSession } from '../../../test/workoutFixtures';
import { finishWorkout, startWorkout } from '@/features/workout/repo';

import {
  PUSH_DEBOUNCE_MS,
  PUSH_DEBOUNCE_WORKOUT_MS,
  pushDebounceMs,
  startSync,
  workoutInProgress,
} from '../scheduler';

const mockSyncNow = jest.fn((_opts: { pull: boolean }) => Promise.resolve({ status: 'ok' }));
jest.mock('../syncEngine', () => ({
  syncNow: (o: { pull: boolean }) => mockSyncNow(o),
  resetPullCursor: jest.fn(),
  useSyncStatus: { getState: () => ({ lastPullAt: Date.now() }), setState: jest.fn() },
}));

let stop: (() => void) | null = null;

beforeEach(async () => {
  await freshDb();
  jest.useFakeTimers();
  stop = startSync();
  mockSyncNow.mockClear(); // the cold-start foreground sync
});
afterEach(() => {
  stop?.();
  jest.useRealTimers();
});

it('pushDebounceMs: 2 s normally, 30 s in a workout', () => {
  expect(pushDebounceMs(false)).toBe(PUSH_DEBOUNCE_MS);
  expect(pushDebounceMs(true)).toBe(PUSH_DEBOUNCE_WORKOUT_MS);
});

it('pushes 2 s after a write outside a workout', () => {
  plannedSession();
  jest.advanceTimersByTime(PUSH_DEBOUNCE_MS);
  expect(mockSyncNow).toHaveBeenCalledWith({ pull: false });
});

it('during a workout waits 30 s, and finishing pushes 2 s later', () => {
  const s = plannedSession();
  startWorkout(s.id);
  expect(workoutInProgress()).toBe(true);
  jest.advanceTimersByTime(PUSH_DEBOUNCE_MS * 2);
  expect(mockSyncNow).not.toHaveBeenCalled();
  finishWorkout(s.id);
  expect(workoutInProgress()).toBe(false);
  jest.advanceTimersByTime(PUSH_DEBOUNCE_MS);
  expect(mockSyncNow).toHaveBeenCalledTimes(1);
});

it('a quiet workout still pushes after 30 s', () => {
  const s = plannedSession();
  startWorkout(s.id);
  jest.advanceTimersByTime(PUSH_DEBOUNCE_WORKOUT_MS);
  expect(mockSyncNow).toHaveBeenCalledTimes(1);
});
