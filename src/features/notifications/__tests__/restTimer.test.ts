/* eslint-disable @typescript-eslint/no-require-imports */
import { Platform } from 'react-native';

import { __state } from '../../../../test/mocks/expoNotifications';
import { REST_ALERT_ID, type RestTimerState } from '../logic/restSurface';
import { connectRestTimer, resetRestTimerForTests, updateRestTimerSurface } from '../restTimer';

jest.mock('expo-notifications', () => require('../../../../test/mocks/expoNotifications'));

const NOW = Date.now();
const state: RestTimerState = {
  sessionId: 's1',
  workoutTitle: 'Push day',
  startedAt: NOW,
  endsAt: NOW + 90_000,
  paused: false,
  remainingMs: null,
  nextExercise: 'Bench press',
  nextSet: 2,
};

function fakeNative() {
  return {
    areActivitiesEnabled: jest.fn(() => true),
    update: jest.fn(async () => true),
    end: jest.fn(async () => undefined),
    showOngoing: jest.fn(async () => true),
    cancelOngoing: jest.fn(async () => undefined),
  };
}

beforeEach(() => {
  __state.reset();
});

describe('rest timer surfaces', () => {
  it(`shows the ${Platform.OS} lock-screen timer and schedules "Rest over" at endsAt`, async () => {
    const mod = fakeNative();
    resetRestTimerForTests(mod);
    await updateRestTimerSurface(state, NOW);
    const alert = __state.scheduled.get(REST_ALERT_ID)!;
    expect(alert.trigger).toEqual({ type: 'date', date: state.endsAt, channelId: 'timer' });
    expect(alert.content).toMatchObject({ title: 'Rest over', body: 'Next: Bench press set 2', data: { kind: 'rest', sessionId: 's1' } });
    if (Platform.OS === 'ios') {
      expect(mod.update).toHaveBeenCalledWith(expect.objectContaining({ endsAt: state.endsAt, workoutTitle: 'Push day' }));
      expect(mod.showOngoing).not.toHaveBeenCalled();
    } else {
      expect(mod.showOngoing).toHaveBeenCalledWith(expect.objectContaining({ endsAt: state.endsAt, title: 'Resting' }));
      expect(mod.update).not.toHaveBeenCalled();
    }
  });

  it('+15 s moves the alert; pause cancels it; null ends the surface', async () => {
    const mod = fakeNative();
    resetRestTimerForTests(mod);
    await updateRestTimerSurface(state, NOW);
    await updateRestTimerSurface({ ...state, endsAt: state.endsAt + 15_000 }, NOW);
    expect(__state.scheduled.get(REST_ALERT_ID)!.trigger.date).toBe(state.endsAt + 15_000);
    await updateRestTimerSurface({ ...state, paused: true, remainingMs: 40_000 }, NOW);
    expect(__state.scheduled.has(REST_ALERT_ID)).toBe(false);
    await updateRestTimerSurface(null, NOW);
    if (Platform.OS === 'ios') expect(mod.end).toHaveBeenCalled();
    else expect(mod.cancelOngoing).toHaveBeenCalled();
  });

  it('a new rest replacing a running one never races end() against update() (latest wins, in order)', async () => {
    const calls: string[] = [];
    let busy = 0;
    const slow = (name: string) =>
      jest.fn(async () => {
        busy++;
        if (busy > 1) calls.push('OVERLAP');
        calls.push(`${name}:start`);
        await new Promise((r) => setTimeout(r, 5));
        calls.push(`${name}:done`);
        busy--;
        return true;
      });
    const mod = { ...fakeNative(), update: slow('update'), end: slow('end'), showOngoing: slow('show'), cancelOngoing: slow('cancel') };
    resetRestTimerForTests(mod as unknown as Parameters<typeof resetRestTimerForTests>[0]);
    await updateRestTimerSurface(state, NOW);
    calls.length = 0;
    // restTimer.start(): end('replaced') publishes null, then the new rest, in the same tick.
    const a = updateRestTimerSurface(null, NOW);
    const b = updateRestTimerSurface({ ...state, endsAt: state.endsAt + 60_000 }, NOW);
    await Promise.all([a, b]);
    expect(calls).not.toContain('OVERLAP');
    const shown = Platform.OS === 'ios' ? 'update' : 'show';
    expect(calls.at(-1)).toBe(`${shown}:done`);
    expect(calls.some((c) => c.startsWith(Platform.OS === 'ios' ? 'end' : 'cancel'))).toBe(false);
    // A later update still applies after the queue drained.
    await updateRestTimerSurface(null, NOW);
    expect(calls.at(-1)).toBe(Platform.OS === 'ios' ? 'end:done' : 'cancel:done');
  });

  it('without the native module (Expo Go / tests) only the alert is used, never throws', async () => {
    resetRestTimerForTests(null);
    await expect(updateRestTimerSurface(state, NOW)).resolves.toBeUndefined();
    expect(__state.scheduled.has(REST_ALERT_ID)).toBe(true);
  });

  it('connectRestTimer mirrors a subscribable timer and cleans up', async () => {
    const mod = fakeNative();
    resetRestTimerForTests(mod);
    let emit: (s: RestTimerState | null) => void = () => undefined;
    const off = jest.fn();
    const stop = connectRestTimer({
      subscribe: (l) => {
        emit = l;
        return off;
      },
    });
    emit(state);
    await new Promise((r) => setTimeout(r, 0));
    expect(__state.scheduled.has(REST_ALERT_ID)).toBe(true);
    stop();
    await new Promise((r) => setTimeout(r, 0));
    expect(off).toHaveBeenCalled();
    expect(__state.scheduled.has(REST_ALERT_ID)).toBe(false);
  });
});
