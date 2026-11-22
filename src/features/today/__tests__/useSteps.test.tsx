import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { kv } from '@/services/storage';

import { stepsFake } from '../../../../test/mocks/steps';
import { stepsForDate } from '../dashboardRepo';
import { STEPS_SAVE_MS, startOfLocalDay, useSteps } from '../hooks/useSteps';
import { freshDb } from '../testing/seed';

const DATE = '2026-11-19';
const NOW = new Date(2026, 10, 19, 15, 0).getTime();
const ios = Platform.OS === 'ios';

beforeEach(async () => {
  await freshDb();
  kv.remove('steps.enabled');
});

describe(`useSteps (${Platform.OS})`, () => {
  it('startOfLocalDay is local midnight', () => {
    const d = startOfLocalDay(DATE);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 10, 19, 0, 0]);
  });

  it('off until the user turns it on; enable asks once, then shows and stores today’s steps', async () => {
    stepsFake.steps = 5432; // iOS CoreMotion total
    const { result } = await renderHook(() => useSteps(DATE, null, NOW));
    await waitFor(() => expect(result.current.state).toEqual({ kind: 'off', reason: 'not_asked' }));
    await act(async () => {
      await result.current.enable();
    });
    if (ios) {
      expect(result.current.state).toEqual({ kind: 'on', steps: 5432 });
      expect(stepsForDate(DATE)).toMatchObject({ steps: 5432, source: 'coremotion' });
    } else {
      // Android without Health Connect: the live pedometer adds to today's stored total.
      expect(result.current.state).toEqual({ kind: 'on', steps: 0 });
      await waitFor(() => expect(stepsFake.watchers.length).toBe(1));
      await act(async () => stepsFake.watchers.forEach((w) => w({ steps: 40 })));
      expect(result.current.state).toEqual({ kind: 'on', steps: 40 });
    }
  });

  it('Android live pedometer saves at most every 15 s, and on unmount', async () => {
    if (ios) return;
    jest.useFakeTimers();
    try {
      kv.set('steps.enabled', '1');
      stepsFake.perm = { granted: true, status: 'granted', canAskAgain: true };
      const { result, unmount } = await renderHook(() => useSteps(DATE, 100, NOW));
      await act(async () => {
        await Promise.resolve();
      });
      await waitFor(() => expect(stepsFake.watchers.length).toBe(1));
      await act(async () => stepsFake.watchers.forEach((w) => w({ steps: 25 })));
      expect(result.current.state).toEqual({ kind: 'on', steps: 125 });
      expect(stepsForDate(DATE)).toBeUndefined();
      await act(async () => jest.advanceTimersByTime(STEPS_SAVE_MS));
      expect(stepsForDate(DATE)).toMatchObject({ steps: 125, source: 'pedometer' });
      await act(async () => stepsFake.watchers.forEach((w) => w({ steps: 30 })));
      await unmount();
      expect(stepsForDate(DATE)?.steps).toBe(130);
      expect(stepsFake.watchers).toHaveLength(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('denied: the tile falls back to "Turn on steps" (never blocks)', async () => {
    stepsFake.grantOnRequest = false;
    const { result } = await renderHook(() => useSteps(DATE, null, NOW));
    await act(async () => {
      await result.current.enable();
    });
    expect(result.current.state).toEqual({ kind: 'off', reason: 'denied' });
  });

  it('opted in earlier: the stored total shows at once', async () => {
    kv.set('steps.enabled', '1');
    stepsFake.perm = { granted: true, status: 'granted', canAskAgain: true };
    stepsFake.steps = 2100;
    const { result } = await renderHook(() => useSteps(DATE, 2100, NOW));
    expect(result.current.state).toEqual({ kind: 'on', steps: 2100 });
  });
});
