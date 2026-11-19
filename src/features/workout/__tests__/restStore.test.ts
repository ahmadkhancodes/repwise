import { Platform } from 'react-native';

import { REST_ONGOING_ID, REST_OVER_ID, createNotificationSurface, installRestNotifier, ongoingContent, resetRestNotifierForTests, restOverContent, type NotificationsLike } from '../restNotifier';
import { registerRestTimerSurface, reloadRestTimerForTests, resetRestTimerForTests, restTimer, type RestTimerSurface } from '../restTimerStore';
import { startRest } from '../logic/restTimer';

function fakeNotifications() {
  const calls: { fn: string; arg: unknown }[] = [];
  const n: NotificationsLike = {
    scheduleNotificationAsync: jest.fn(async (r) => {
      calls.push({ fn: 'schedule', arg: r });
      return r.identifier ?? 'x';
    }),
    cancelScheduledNotificationAsync: jest.fn(async (id) => {
      calls.push({ fn: 'cancel', arg: id });
    }),
    dismissNotificationAsync: jest.fn(async (id) => {
      calls.push({ fn: 'dismiss', arg: id });
    }),
    setNotificationChannelAsync: jest.fn(async () => null),
    AndroidImportance: { HIGH: 4, LOW: 2 },
  };
  return { n, calls };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  resetRestTimerForTests();
  resetRestNotifierForTests();
});

describe('restTimer store', () => {
  it('starts, adjusts, pauses, resumes and skips, telling every surface', () => {
    const surface: RestTimerSurface = { start: jest.fn(), update: jest.fn(), end: jest.fn() };
    const off = registerRestTimerSurface(surface);
    const seen: string[] = [];
    const unsub = restTimer.subscribe((s) => seen.push(s.status));

    restTimer.start('s1', 90, { exercise: 'Bench press', setNo: 2 }, 1000);
    expect(restTimer.getState()).toMatchObject({ status: 'running', endsAt: 91_000 });
    expect(surface.start).toHaveBeenCalledTimes(1);
    restTimer.add(15, 2000);
    restTimer.pause(3000);
    restTimer.resume(5000);
    expect(restTimer.getState()).toMatchObject({ status: 'running', endsAt: 108_000 });
    expect(surface.update).toHaveBeenCalledTimes(3);
    restTimer.skip();
    expect(restTimer.getState().status).toBe('idle');
    expect(surface.end).toHaveBeenCalledWith('skipped', expect.objectContaining({ sessionId: 's1' }));
    expect(seen).toEqual(['running', 'running', 'paused', 'running', 'idle']);
    unsub();
    off();
  });
  it('ends by itself once time is up, and a new start replaces the old one', () => {
    const end = jest.fn();
    registerRestTimerSurface({ start: jest.fn(), update: jest.fn(), end });
    restTimer.start('s1', 60, null, 0);
    expect(restTimer.check(59_000)).toBe(false);
    restTimer.start('s1', 60, null, 10_000);
    expect(end).toHaveBeenLastCalledWith('replaced', expect.anything());
    expect(restTimer.check(70_000)).toBe(true);
    expect(end).toHaveBeenLastCalledWith('done', expect.anything());
    restTimer.add(-500, 0); // idle: no-op
    expect(restTimer.getState().status).toBe('idle');
  });
  it('survives an app kill (persisted) and clears with its workout', () => {
    restTimer.start('s9', 120, null, 1000);
    expect(reloadRestTimerForTests()).toMatchObject({ status: 'running', sessionId: 's9', endsAt: 121_000 });
    restTimer.clearFor('other');
    expect(restTimer.getState().status).toBe('running');
    restTimer.clearFor('s9');
    expect(reloadRestTimerForTests().status).toBe('idle');
  });
  it('removing all the time ends the rest', () => {
    restTimer.start('s1', 15, null, 0);
    restTimer.add(-15, 0);
    expect(restTimer.getState().status).toBe('idle');
  });
});

describe(`rest notifications (${Platform.OS})`, () => {
  it('schedules "Rest over" at the end time and keeps an ongoing notification on Android', async () => {
    const { n, calls } = fakeNotifications();
    const surface = createNotificationSurface(n, () => 0);
    const s = startRest(Date.UTC(2026, 10, 19, 12, 0), 90, 's1', { exercise: 'Squat', setNo: 3 });
    surface.start(s);
    await flush();
    const scheduled = calls.filter((c) => c.fn === 'schedule').map((c) => c.arg as { identifier: string; content: Record<string, unknown>; trigger: Record<string, unknown> });
    const over = scheduled.find((r) => r.identifier === REST_OVER_ID);
    expect(over?.content).toMatchObject({ title: 'Rest over', body: 'Next: Squat set 3' });
    expect(over?.trigger).toMatchObject({ type: 'date', date: s.endsAt, channelId: 'timer' });
    const ongoing = scheduled.find((r) => r.identifier === REST_ONGOING_ID);
    if (Platform.OS === 'android') {
      expect(ongoing?.content).toMatchObject({ title: 'Resting', sticky: true });
      expect(n.setNotificationChannelAsync).toHaveBeenCalledWith('timer', expect.objectContaining({ importance: 4 }));
      expect(over?.content).toMatchObject({ priority: 'max' });
    } else {
      expect(ongoing).toBeUndefined();
      expect(over?.content).toMatchObject({ interruptionLevel: 'timeSensitive' });
    }
  });
  it('cancels on skip and pause, but not when it already fired', async () => {
    const { n, calls } = fakeNotifications();
    const surface = createNotificationSurface(n, () => 0);
    const s = startRest(0, 60, 's1');
    surface.update({ ...s, status: 'paused', pausedAt: 10 });
    await flush();
    expect(calls.filter((c) => c.fn === 'schedule' && (c.arg as { identifier: string }).identifier === REST_OVER_ID)).toHaveLength(0);
    surface.end('done', s);
    expect(calls.filter((c) => c.fn === 'cancel')).toHaveLength(1); // only the pause cancel
    surface.end('skipped', s);
    expect(calls.filter((c) => c.fn === 'cancel')).toHaveLength(2);
    expect(calls.some((c) => c.fn === 'dismiss')).toBe(Platform.OS === 'android');
  });
  it('copy reads well', () => {
    const s = startRest(0, 60, 's1', { exercise: 'Row', setNo: 1 });
    expect(restOverContent({ ...s, next: null }).body).toBe('Time for your next set');
    expect(ongoingContent({ ...s, status: 'paused', pausedAt: 15_000 }, 0)).toEqual({ title: 'Rest paused', body: '0:45 left · Next: Row' });
  });
  it('installs once, and only with the module present', () => {
    expect(installRestNotifier(null)).toBe(false);
    const { n } = fakeNotifications();
    expect(installRestNotifier(n)).toBe(true);
    expect(installRestNotifier(n)).toBe(true);
    restTimer.start('s1', 30, null);
    expect(n.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
  });
});
