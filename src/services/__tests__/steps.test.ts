import { Platform } from 'react-native';

import { kv } from '@/services/storage';

import { stepsFake, healthConnect, Pedometer } from '../../../test/mocks/steps';
import { enableSteps, readSteps, stepsAccess, stepsOptedIn, turnOffSteps, watchSteps } from '../steps';

const START = new Date(2026, 10, 22, 0, 0);
const END = new Date(2026, 10, 22, 15, 0);
const ios = Platform.OS === 'ios';

beforeEach(() => {
  kv.remove('steps.enabled');
  jest.clearAllMocks();
});

describe(`steps service (${Platform.OS})`, () => {
  it('never touches the sensors before the user turns steps on', async () => {
    expect(stepsOptedIn()).toBe(false);
    expect(await readSteps(START, END)).toEqual({ ok: false, reason: 'not_asked' });
    expect(Pedometer.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(healthConnect.requestPermission).not.toHaveBeenCalled();
  });

  it('pedometer path: asks in context, then reads (iOS: the day total; Android: live only)', async () => {
    stepsFake.steps = 4321;
    expect(await enableSteps()).toBe('granted');
    expect(stepsOptedIn()).toBe(true);
    expect(Pedometer.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    const r = await readSteps(START, END);
    if (ios) {
      expect(r).toEqual({ ok: true, source: 'coremotion', steps: 4321 });
      expect(Pedometer.getStepCountAsync).toHaveBeenCalledWith(START, END);
    } else {
      expect(r).toEqual({ ok: true, source: 'pedometer', steps: null });
    }
    expect((await stepsAccess()).access).toBe('granted');
  });

  it('denied: reads as off/denied, never throws', async () => {
    stepsFake.grantOnRequest = false;
    expect(await enableSteps()).toBe('denied');
    expect(await readSteps(START, END)).toEqual({ ok: false, reason: 'denied' });
  });

  it('no step counter on this phone: unavailable', async () => {
    stepsFake.available = false;
    expect(await enableSteps()).toBe('unavailable');
    expect(await readSteps(START, END)).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('a sensor error reads as unavailable', async () => {
    Pedometer.isAvailableAsync.mockRejectedValueOnce(new Error('boom'));
    expect(await stepsAccess()).toEqual({ access: 'unavailable', source: null });
  });

  it('Health Connect: Steps READ only, day total from aggregateRecord (Android); ignored on iOS', async () => {
    stepsFake.hcStatus = 3;
    stepsFake.hcSteps = 9876;
    expect(await enableSteps()).toBe('granted');
    const r = await readSteps(START, END);
    if (ios) {
      expect(healthConnect.getSdkStatus).not.toHaveBeenCalled();
      expect(r).toMatchObject({ ok: true, source: 'coremotion' });
    } else {
      expect(healthConnect.requestPermission).toHaveBeenCalledWith([{ accessType: 'read', recordType: 'Steps' }]);
      expect(r).toEqual({ ok: true, source: 'health_connect', steps: 9876 });
      expect(healthConnect.aggregateRecord).toHaveBeenCalledWith({
        recordType: 'Steps',
        timeRangeFilter: { operator: 'between', startTime: START.toISOString(), endTime: END.toISOString() },
      });
      expect(Pedometer.requestPermissionsAsync).not.toHaveBeenCalled();
    }
  });

  it('Health Connect declined on Android falls back to the pedometer permission', async () => {
    stepsFake.hcStatus = 3;
    stepsFake.hcGrantOnRequest = false;
    expect(await enableSteps()).toBe('granted');
    expect(Pedometer.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('watchSteps reports live counts and unsubscribes', () => {
    const seen: number[] = [];
    const off = watchSteps((n) => seen.push(n));
    stepsFake.watchers.forEach((w) => w({ steps: 12 }));
    off();
    expect(stepsFake.watchers).toHaveLength(0);
    expect(seen).toEqual([12]);
  });

  it('turnOffSteps forgets the opt-in', async () => {
    await enableSteps();
    turnOffSteps();
    expect(stepsOptedIn()).toBe(false);
  });
});
