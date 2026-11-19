import { Platform } from 'react-native';

import { createSurfaceBridge, installRestNotifier, resetRestNotifierForTests, toSurfaceState } from '../restNotifier';
import { registerRestTimerSurface, reloadRestTimerForTests, resetRestTimerForTests, restTimer, type RestTimerSurface } from '../restTimerStore';
import { startRest } from '../logic/restTimer';

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

describe(`lock-screen bridge (${Platform.OS})`, () => {
  it('maps running and paused rests to the notifications contract', () => {
    const s = startRest(1000, 90, 's1', { exercise: 'Squat', setNo: 3 });
    expect(toSurfaceState(s, 'Leg day', 2000)).toEqual({
      sessionId: 's1',
      workoutTitle: 'Leg day',
      startedAt: 1000,
      endsAt: 91_000,
      paused: false,
      remainingMs: null,
      nextExercise: 'Squat',
      nextSet: 3,
    });
    expect(toSurfaceState({ ...s, status: 'paused', pausedAt: 31_000 }, null, 50_000)).toMatchObject({
      paused: true,
      remainingMs: 60_000,
    });
  });
  it('publishes every transition and null at the end', () => {
    const update = jest.fn();
    expect(installRestNotifier(null)).toBe(false);
    expect(installRestNotifier(update)).toBe(true);
    expect(installRestNotifier(update)).toBe(true);
    restTimer.start('s1', 30, null, 0);
    restTimer.add(15, 1);
    restTimer.skip();
    expect(update).toHaveBeenCalledTimes(3);
    expect(update.mock.calls[0]?.[0]).toMatchObject({ sessionId: 's1', endsAt: 30_000 });
    expect(update.mock.calls[1]?.[0]).toMatchObject({ endsAt: 45_000 });
    expect(update.mock.calls[2]?.[0]).toBeNull();
  });
  it('never throws from a failing surface', () => {
    const bridge = createSurfaceBridge(() => {
      throw new Error('native');
    });
    const s = startRest(0, 30, 's1');
    expect(() => bridge.start(s)).not.toThrow();
    expect(() => bridge.end('done', s)).not.toThrow();
  });
});
