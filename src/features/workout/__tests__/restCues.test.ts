import { AppState, Platform } from 'react-native';

import type { RestAction } from '@/features/notifications/restTimer';
import { DEFAULT_APP_PREFS, useAppPrefs } from '@/features/settings';
import { haptics } from '@/services/haptics';

import { __state } from '../../../../test/mocks/expoNotifications';
import {
  applyRestAction,
  installRestNotifier,
  presentRestOver,
  resetRestNotifierForTests,
  type RestActionSource,
} from '../restNotifier';
import { resetRestTimerForTests, restTimer } from '../restTimerStore';

const N = jest.requireMock('expo-notifications') as typeof import('../../../../test/mocks/expoNotifications');
const appState = AppState as unknown as { currentState: string };

beforeEach(() => {
  resetRestTimerForTests();
  resetRestNotifierForTests();
  useAppPrefs.setState({ ...DEFAULT_APP_PREFS });
  __state.reset();
  jest.clearAllMocks();
  appState.currentState = 'active';
});

const last = { status: 'running', sessionId: 's1', durationMs: 60_000, startedAt: 0, endsAt: 60_000, pausedAt: null, next: null } as const;

describe(`"Rest over" honours the settings (N5, N6, ${Platform.OS})`, () => {
  it('in-app cue: marked inApp, sound and channel follow "Rest timer sound"', async () => {
    await presentRestOver(last);
    expect(N.scheduleNotificationAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({ sound: 'default', data: expect.objectContaining({ kind: 'rest', inApp: true }) }),
        trigger: { channelId: 'timer' },
      }),
    );
    useAppPrefs.setState({ restSound: false });
    await presentRestOver(last);
    expect(N.scheduleNotificationAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: expect.objectContaining({ sound: false }), trigger: { channelId: 'timer-silent' } }),
    );
  });

  it('no rest-end vibration when "Rest vibration" is off', () => {
    const spy = jest.spyOn(haptics, 'restEnd').mockImplementation(() => undefined);
    restTimer.start('s1', 60, null, 0);
    restTimer.check(60_000);
    expect(spy).toHaveBeenCalledTimes(1);
    useAppPrefs.setState({ restVibration: false });
    restTimer.start('s1', 60, null, 100_000);
    restTimer.check(160_000);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe(`lock-screen +15 s / Skip (N7, ${Platform.OS})`, () => {
  const tap = (over: Partial<RestAction>): RestAction => ({ id: 'a1', action: 'add15', at: 1, ...over });

  it('+15 s matches the native end time; repeats and other workouts are ignored', () => {
    restTimer.start('s1', 60, null, 0);
    expect(applyRestAction(tap({ endsAt: 75_000, sessionId: 's1' }), restTimer, 1_000)).toBe(true);
    expect(restTimer.getState()).toMatchObject({ status: 'running', endsAt: 75_000 });
    expect(applyRestAction(tap({ endsAt: 75_000, sessionId: 's1' }), restTimer, 1_000)).toBe(false); // same tap id
    expect(applyRestAction(tap({ id: 'a2', sessionId: 'other' }), restTimer, 1_000)).toBe(false);
    expect(applyRestAction(tap({ id: 'a3' }), restTimer, 1_000)).toBe(true); // no endsAt: +15 s
    expect(restTimer.getState()).toMatchObject({ endsAt: 90_000 });
    expect(applyRestAction(tap({ id: 'a4', action: 'skip' }), restTimer, 1_000)).toBe(true);
    expect(restTimer.getState().status).toBe('idle');
    expect(applyRestAction(tap({ id: 'a5', action: 'skip' }), restTimer, 1_000)).toBe(false); // no rest
  });

  it('install listens (turning the buttons on) and drains queued taps now and on foreground', () => {
    let live: ((a: RestAction) => void) | null = null;
    const queue: RestAction[] = [tap({ id: 'q1', action: 'add15' })];
    const source: RestActionSource = {
      subscribe: jest.fn((h) => {
        live = h;
        return () => undefined;
      }),
      drain: jest.fn(() => queue.splice(0)),
    };
    let onChange: ((s: string) => void) | null = null;
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((ev: string, fn: (s: string) => void) => {
      if (ev === 'change') onChange = fn;
      return { remove: () => undefined };
    }) as never);
    restTimer.start('s1', 60, null, Date.now());
    const before = restTimer.getState();
    installRestNotifier(jest.fn(), null, source);
    expect(source.subscribe).toHaveBeenCalledTimes(1);
    expect(source.drain).toHaveBeenCalledTimes(1);
    const after = restTimer.getState();
    expect(after.status === 'running' && before.status === 'running' && after.endsAt - before.endsAt).toBe(15_000);
    live!(tap({ id: 'live-skip', action: 'skip' }));
    expect(restTimer.getState().status).toBe('idle');
    // Back to the foreground: the queue is drained again.
    queue.push(tap({ id: 'q2', action: 'skip' }));
    restTimer.start('s1', 60, null, Date.now());
    onChange!('active');
    expect(queue).toHaveLength(0);
    expect(restTimer.getState().status).toBe('idle');
    spy.mockRestore();
  });
});
