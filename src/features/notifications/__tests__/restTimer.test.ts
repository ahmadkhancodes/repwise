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
