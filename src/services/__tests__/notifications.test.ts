/* eslint-disable @typescript-eslint/no-require-imports */
import { Linking, Platform } from 'react-native';

import { resetDbForTests } from '@/db/client';
import { migrateDb } from '@/db/migrate';
import { setRowOwner } from '@/db/owner';
import { customRecipesRepo, mealPlansRepo, mealsRepo } from '@/features/meals/repo';
import { reloadPrefsForTests, useNotificationPrefs } from '@/features/notifications/prefsStore';
import { saveProfile } from '@/features/settings/repo';
import { sessionExercisesRepo, sessionsRepo, setsRepo } from '@/features/workout/repo';
import { resetAnalyticsForTests, trackedEvents } from '@/services/analytics';
import { resetBillingState } from '@/services/billing';
import { kv } from '@/services/storage';
import { readStoredSnapshot, resetWriterForTests } from '@/widgets/writer';

import { __state, makeResponse } from '../../../test/mocks/expoNotifications';
import {
  handleResponse,
  IGNORED_WRITE_TABLES,
  rebuildSchedule,
  requestPermission,
  resetNotificationsForTests,
  startNotifications,
  useNotificationsStore,
} from '../notifications';

jest.mock('expo-notifications', () => require('../../../test/mocks/expoNotifications'));
jest.mock('react-native-android-widget', () => require('../../../test/mocks/androidWidget'));
jest.mock('@bacons/apple-targets', () => ({
  ExtensionStorage: Object.assign(jest.fn().mockImplementation(() => ({ set: jest.fn() })), { reloadWidget: jest.fn() }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() } }));

const N = jest.requireMock('expo-notifications') as typeof import('../../../test/mocks/expoNotifications');

// Thursday 19 Nov 2026 06:00 UTC.
const NOW = Date.UTC(2026, 10, 19, 6, 0);
const TZ = 'UTC';
const DATE = '2026-11-19';

let lunchId = '';
let sessionId = '';

function seed() {
  saveProfile({ sessionMin: 50, mealTimes: ['lunch=13:00', 'dinner=19:30'] });
  const s = sessionsRepo.insert({ date: DATE, title: 'Leg day', status: 'planned' });
  sessionId = s.id;
  for (let i = 0; i < 5; i++) sessionExercisesRepo.insert({ sessionId, exerciseId: `ex-${i}`, position: i });
  const plan = mealPlansRepo.insert({ date: DATE, kcalTarget: 2300, macros: { protein: 150, carbs: 250, fat: 70 } });
  const bowl = customRecipesRepo.insert({ title: 'Chicken bowl', kcal: 600, protein: 45, carb: 60, fat: 18 });
  const rice = customRecipesRepo.insert({ title: 'Salmon rice', kcal: 700, protein: 40, carb: 80, fat: 22 });
  lunchId = mealsRepo.insert({ mealPlanId: plan.id, slot: 'lunch', recipeId: bowl.id }).id;
  mealsRepo.insert({ mealPlanId: plan.id, slot: 'dinner', recipeId: rice.id });
}

const navigate = jest.fn();
const deps = {
  navigate,
  logMeal: (id: string) => {
    const m = mealsRepo.get(id);
    if (!m) return false;
    mealsRepo.update(id, { status: 'eaten', eatenAt: NOW });
    return true;
  },
  now: () => NOW,
};

beforeEach(async () => {
  resetDbForTests();
  setRowOwner(null);
  await migrateDb();
  __state.reset();
  jest.clearAllMocks();
  resetNotificationsForTests();
  resetWriterForTests();
  resetAnalyticsForTests();
  resetBillingState();
  kv.remove('notifications.prefs.v1');
  reloadPrefsForTests();
  seed();
});

afterEach(() => {
  resetNotificationsForTests();
  jest.useRealTimers();
});

describe('rebuildSchedule', () => {
  it('schedules sheet 17 reminders from the database at the right local time', async () => {
    await rebuildSchedule({ now: NOW, timeZone: TZ });
    const ids = [...__state.scheduled.keys()];
    expect(ids).toEqual(
      expect.arrayContaining([
        `rw:brief:${DATE}`,
        `rw:meal:${DATE}:lunch`,
        `rw:meal:${DATE}:dinner`,
        `rw:workout:${DATE}`,
        'rw:checkin:2026-11-22',
      ]),
    );
    const lunch = __state.scheduled.get(`rw:meal:${DATE}:lunch`)!;
    expect(lunch.content).toMatchObject({
      title: 'Lunch time 🍽',
      body: 'Chicken bowl · 600 kcal · 45 g protein',
      categoryIdentifier: 'meal',
      data: { kind: 'meal', mealId: lunchId },
    });
    expect(lunch.trigger).toEqual({ type: 'date', date: Date.UTC(2026, 10, 19, 13, 0), channelId: 'meals' });
    expect(__state.scheduled.get(`rw:workout:${DATE}`)!.content).toMatchObject({
      title: 'Leg day in 30 min',
      body: '5 exercises · 50 min',
    });
    expect(useNotificationsStore.getState()).toMatchObject({ status: 'ready', permission: 'granted' });
    expect(useNotificationsStore.getState().scheduled[0]?.key).toBe(`rw:brief:${DATE}`);
  });

  it('writes the widget snapshot from the same data', async () => {
    await rebuildSchedule({ now: NOW, timeZone: TZ });
    expect(readStoredSnapshot()).toMatchObject({
      date: DATE,
      pro: true,
      workout: { sessionId, title: 'Leg day', exercises: 5, minutes: 50, status: 'planned' },
      nextMeal: { slot: 'lunch', name: 'Chicken bowl', kcal: 600, time: '13:00' },
      kcal: { eaten: 0, target: 2300 },
      macros: { p: { target: 150 } },
    });
  });

  it('a second rebuild touches nothing; a change cancels exactly what changed', async () => {
    await rebuildSchedule({ now: NOW, timeZone: TZ });
    N.scheduleNotificationAsync.mockClear();
    await rebuildSchedule({ now: NOW, timeZone: TZ });
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(N.cancelScheduledNotificationAsync).not.toHaveBeenCalled();

    mealsRepo.update(lunchId, { status: 'eaten', eatenAt: NOW });
    await rebuildSchedule({ now: NOW, timeZone: TZ });
    expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith(`rw:meal:${DATE}:lunch`);
    expect(__state.scheduled.has(`rw:meal:${DATE}:lunch`)).toBe(false);
    expect(readStoredSnapshot()?.kcal.eaten).toBe(600);
  });

  it('a user travelling to another zone gets the same wall-clock times', async () => {
    await rebuildSchedule({ now: NOW, timeZone: TZ });
    await rebuildSchedule({ now: NOW, timeZone: 'Asia/Kolkata' });
    // 13:00 in Kolkata = 07:30 UTC.
    expect(__state.scheduled.get(`rw:meal:${DATE}:lunch`)!.trigger.date).toBe(Date.UTC(2026, 10, 19, 7, 30));
  });

  it('without permission nothing is scheduled and old reminders are cancelled', async () => {
    await rebuildSchedule({ now: NOW, timeZone: TZ });
    __state.permission = { granted: false, status: 'denied', canAskAgain: false };
    await rebuildSchedule({ now: NOW, timeZone: TZ });
    expect(__state.scheduled.size).toBe(0);
    expect(useNotificationsStore.getState().permission).toBe('denied');
    // The widget still updates without notification permission.
    expect(readStoredSnapshot()?.workout?.title).toBe('Leg day');
  });

  it('turning a toggle off removes those reminders', async () => {
    await rebuildSchedule({ now: NOW, timeZone: TZ });
    useNotificationPrefs.getState().set('meals', false);
    await rebuildSchedule({ now: NOW, timeZone: TZ });
    expect([...__state.scheduled.keys()].some((k) => k.startsWith('rw:meal:'))).toBe(false);
    expect(__state.scheduled.has(`rw:brief:${DATE}`)).toBe(true);
  });

  it('a failed schedule is retried by the next rebuild', async () => {
    __state.failSchedule = true;
    await rebuildSchedule({ now: NOW, timeZone: TZ });
    expect(__state.scheduled.size).toBe(0);
    __state.failSchedule = false;
    await rebuildSchedule({ now: NOW, timeZone: TZ });
    expect(__state.scheduled.has(`rw:meal:${DATE}:lunch`)).toBe(true);
  });

  it(`creates channels only on Android and action categories on both (${Platform.OS})`, async () => {
    await rebuildSchedule({ now: NOW, timeZone: TZ });
    if (Platform.OS === 'android') {
      expect([...__state.channels.keys()].sort()).toEqual(['account', 'brief', 'checkin', 'meals', 'timer', 'training']);
      expect(__state.channels.get('timer')).toMatchObject({ importance: 7 });
    } else {
      expect(__state.channels.size).toBe(0);
    }
    expect([...__state.categories.keys()].sort()).toEqual(['checkin', 'meal', 'trial', 'workout']);
    const meal = __state.categories.get('meal') as { identifier: string; options: { opensAppToForeground: boolean } }[];
    expect(meal.map((a) => a.identifier)).toEqual(['ate', 'swap', 'snooze']);
    expect(meal.every((a) => a.options.opensAppToForeground)).toBe(true);
  });
});

describe('responses', () => {
  const lunchData = () => ({ kind: 'meal', url: '/eat', mealId: lunchId, slot: 'lunch', date: DATE });

  it('"Ate it" logs the meal, opens Eat and is handled only once', async () => {
    const r = makeResponse(`rw:meal:${DATE}:lunch`, 'ate', lunchData());
    expect(await handleResponse(r as never, deps)).toMatchObject({ type: 'logMeal' });
    expect(mealsRepo.get(lunchId)?.status).toBe('eaten');
    expect(navigate).toHaveBeenCalledWith(`/eat?mealId=${lunchId}&logged=1`);
    expect(__state.dismissed).toContain(`rw:meal:${DATE}:lunch`);
    expect(trackedEvents()).toContainEqual({ event: 'app_open', props: { source: 'notification' } });

    navigate.mockClear();
    expect(await handleResponse(r as never, deps)).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('default deps log the meal with analytics', async () => {
    const r = makeResponse(`rw:meal:${DATE}:lunch`, 'ate', lunchData(), 77);
    await handleResponse(r as never);
    expect(mealsRepo.get(lunchId)?.status).toBe('eaten');
    expect(trackedEvents()).toContainEqual({ event: 'meal_logged', props: { slot: 'lunch', from_plan: true } });
  });

  it('Snooze reschedules a copy 10 minutes later', async () => {
    await handleResponse(makeResponse(`rw:workout:${DATE}`, 'snooze', { kind: 'workout', url: '/train', sessionId }, 2, {
      title: 'Leg day in 30 min',
      body: '5 exercises · 50 min',
    }) as never, deps);
    const req = __state.scheduled.get(`rw:snooze:rw:workout:${DATE}`)!;
    expect(req.trigger).toEqual({ type: 'date', date: NOW + 600_000, channelId: 'training' });
    expect(req.content).toMatchObject({ title: 'Leg day in 30 min', categoryIdentifier: 'workout', data: { sessionId } });
  });

  it('Start opens the workout; a cold-start response is handled on start', async () => {
    __state.last = makeResponse(`rw:workout:${DATE}`, 'start', { kind: 'workout', url: '/train', sessionId }, 3);
    startNotifications(deps);
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(navigate).toHaveBeenCalledWith(`/train?sessionId=${sessionId}&start=1`);
    expect(__state.last).toBeNull();

    // A live tap arrives through the listener.
    __state.emit(makeResponse(`rw:checkin:2026-11-22`, 'checkin', { kind: 'checkin', url: '/today' }, 4));
    await new Promise((r) => setTimeout(r, 0));
    expect(navigate).toHaveBeenCalledWith('/today?checkin=1');
  });
});

describe('lifecycle', () => {
  it('local writes trigger a debounced rebuild', async () => {
    jest.useFakeTimers({ now: NOW });
    startNotifications(deps);
    // The launch rebuild waits FIRST_REBUILD_DELAY_MS (not in the first 2 s after launch).
    await jest.advanceTimersByTimeAsync(2_000);
    expect(__state.scheduled.size).toBe(0);
    await jest.advanceTimersByTimeAsync(1_000);
    const before = __state.scheduled.size;
    expect(before).toBeGreaterThan(0);
    mealsRepo.update(lunchId, { status: 'skipped' });
    await jest.advanceTimersByTimeAsync(2_000);
    expect(__state.scheduled.has(`rw:meal:${DATE}:lunch`)).toBe(false);
  });

  it('a logged set does not rebuild the schedule; a session write does (perf A10)', async () => {
    jest.useFakeTimers({ now: NOW });
    startNotifications(deps);
    await jest.advanceTimersByTimeAsync(2_000);
    const calls = () => N.getAllScheduledNotificationsAsync.mock.calls.length;
    const before = calls();
    const s = sessionsRepo.insert({ date: DATE, title: 'Push', status: 'active' });
    await jest.advanceTimersByTimeAsync(2_000);
    const afterSession = calls();
    expect(afterSession).toBeGreaterThan(before);
    for (let i = 0; i < 3; i++) setsRepo.insert({ sessionExerciseId: 'se', idx: i, reps: 5 });
    await jest.advanceTimersByTimeAsync(2_000);
    expect(calls()).toBe(afterSession);
    sessionsRepo.update(s.id, { status: 'done' });
    await jest.advanceTimersByTimeAsync(2_000);
    expect(calls()).toBeGreaterThan(afterSession);
    expect(IGNORED_WRITE_TABLES.has('sets')).toBe(true);
  });

  it('requestPermission asks once, tracks the result, then sends the user to Settings', async () => {
    __state.permission = { granted: false, status: 'undetermined', canAskAgain: true };
    __state.requestResult = { granted: false, status: 'denied', canAskAgain: false };
    expect(await requestPermission()).toBe('denied');
    expect(trackedEvents()).toContainEqual({ event: 'notification_permission', props: { granted: false } });
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    expect(await requestPermission()).toBe('denied');
    expect(open).toHaveBeenCalled();
    expect(N.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('granting permission tracks granted: true', async () => {
    __state.permission = { granted: false, status: 'undetermined', canAskAgain: true };
    expect(await requestPermission()).toBe('granted');
    expect(trackedEvents()).toContainEqual({ event: 'notification_permission', props: { granted: true } });
  });
});
