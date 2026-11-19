import { displayTime, joinHm, relativeDay, shiftHm, splitHm } from '../clock';
import { diffSchedule, parseStored } from '../diff';
import { DEFAULT_PREFS, parseProfileMealTimes, resolveMealTimes, sanitizePrefs } from '../prefs';
import { planRestSurface, type RestTimerState } from '../restSurface';
import {
  ACTIONS,
  CATEGORY_ACTIONS,
  DEFAULT_ACTION,
  parseData,
  resolveResponse,
  responseKey,
  workoutUrl,
} from '../responses';
import { notificationHash, type PlannedNotification } from '../schedule';

describe('prefs', () => {
  it('sanitizePrefs keeps valid values and drops bad ones', () => {
    const p = sanitizePrefs({
      brief: false,
      wakeTime: '06:30',
      workoutTime: '25:00',
      workoutLeadMin: 999,
      checkinDay: 3,
      quietStart: 'nope',
      mealTimes: { lunch: '12:15', dinner: 'x', brunch: '11:00' },
    });
    expect(p.brief).toBe(false);
    expect(p.wakeTime).toBe('06:30');
    expect(p.workoutTime).toBe(DEFAULT_PREFS.workoutTime);
    expect(p.workoutLeadMin).toBe(DEFAULT_PREFS.workoutLeadMin);
    expect(p.checkinDay).toBe(3);
    expect(p.quietStart).toBe('22:00');
    expect(p.mealTimes).toEqual({ lunch: '12:15' });
    expect(sanitizePrefs('garbage')).toEqual(DEFAULT_PREFS);
  });

  it('parses profile meal times in named and positional forms', () => {
    expect(parseProfileMealTimes(['breakfast=07:30', 'lunch@12:00', 'dinner 19:15'])).toEqual({
      breakfast: '07:30',
      lunch: '12:00',
      dinner: '19:15',
    });
    expect(parseProfileMealTimes(['08:00', '13:00', '19:00'])).toEqual({
      breakfast: '08:00',
      lunch: '13:00',
      dinner: '19:00',
    });
    expect(parseProfileMealTimes(['08:00', '13:00', '16:00', '19:00'])).toMatchObject({ snack: '16:00' });
    expect(parseProfileMealTimes(null)).toEqual({});
    expect(resolveMealTimes(DEFAULT_PREFS, ['lunch=12:00']).lunch).toBe('12:00');
    expect(resolveMealTimes(DEFAULT_PREFS, null).snack).toBe('16:30');
  });
});

describe('clock', () => {
  it('formats 12 h and 24 h times', () => {
    expect(displayTime('13:05', true)).toBe('1:05 PM');
    expect(displayTime('00:10', true)).toBe('12:10 AM');
    expect(displayTime('12:00', true)).toBe('12:00 PM');
    expect(displayTime('07:15', false)).toBe('07:15');
    expect(displayTime('bad', false)).toBe('bad');
  });

  it('shifts, splits and joins', () => {
    expect(shiftHm('23:50', 15)).toBe('00:05');
    expect(splitHm('07:13')).toEqual({ hour: 7, minute: 15 });
    expect(splitHm('07:58')).toEqual({ hour: 7, minute: 55 });
    expect(joinHm(9, 5)).toBe('09:05');
    expect(relativeDay('2026-11-19', '2026-11-19', '2026-11-20', 4)).toBe('Today');
    expect(relativeDay('2026-11-20', '2026-11-19', '2026-11-20', 5)).toBe('Tomorrow');
    expect(relativeDay('2026-11-22', '2026-11-19', '2026-11-20', 0)).toBe('Sun');
  });
});

describe('diffSchedule', () => {
  const n = (key: string, at: number, body = 'b'): PlannedNotification => ({
    key,
    kind: 'meal',
    at,
    title: 't',
    body,
    channelId: 'meals',
    categoryId: 'meal',
    data: { kind: 'meal', url: '/eat' },
  });

  it('first run schedules everything', () => {
    const d = diffSchedule({}, [n('a', 1), n('b', 2)]);
    expect(d.cancel).toEqual([]);
    expect(d.schedule.map((x) => x.key)).toEqual(['a', 'b']);
    expect(Object.keys(d.next)).toEqual(['a', 'b']);
  });

  it('second identical run is a no-op; changes cancel and reschedule', () => {
    const first = diffSchedule({}, [n('a', 1), n('b', 2)]);
    expect(diffSchedule(first.next, [n('a', 1), n('b', 2)])).toMatchObject({ cancel: [], schedule: [] });
    const changed = diffSchedule(first.next, [n('a', 1, 'new'), n('c', 3)]);
    expect(changed.cancel.sort()).toEqual(['a', 'b']);
    expect(changed.schedule.map((x) => x.key)).toEqual(['a', 'c']);
    expect(changed.next.a).toBe(notificationHash(n('a', 1, 'new')));
  });

  it('re-adds what the OS lost, never cancels ids it did not store', () => {
    const first = diffSchedule({}, [n('a', 1)]);
    const d = diffSchedule(first.next, [n('a', 1)], ['rw:snooze:x']);
    expect(d.schedule.map((x) => x.key)).toEqual(['a']);
    expect(d.cancel).toEqual([]);
  });

  it('parseStored tolerates garbage', () => {
    expect(parseStored('{"a":"h","b":3}')).toEqual({ a: 'h' });
    expect(parseStored('[1]')).toEqual({});
    expect(parseStored('{')).toEqual({});
    expect(parseStored(undefined)).toEqual({});
  });
});

describe('notification responses', () => {
  const base = { identifier: 'rw:meal:2026-11-19:lunch', title: 'Lunch time 🍽', body: 'Bowl', date: 5 };
  const meal = { kind: 'meal', url: '/eat', mealId: 'm1', slot: 'lunch', date: '2026-11-19' };

  it('every category has the sheet 17 buttons', () => {
    expect(CATEGORY_ACTIONS.meal.map((a) => a.title)).toEqual(['Ate it', 'Swap', 'Snooze 10 min']);
    expect(CATEGORY_ACTIONS.workout.map((a) => a.title)).toEqual(['Start', 'Snooze 10 min']);
    expect(CATEGORY_ACTIONS.trial.map((a) => a.title)).toEqual(['Manage']);
  });

  it('Ate it logs the meal then opens Eat', () => {
    expect(resolveResponse({ ...base, actionIdentifier: ACTIONS.ate, data: meal })).toEqual({
      type: 'logMeal',
      mealId: 'm1',
      slot: 'lunch',
      then: '/eat?mealId=m1&logged=1',
    });
  });

  it('Swap, Start, Manage and check-in navigate', () => {
    expect(resolveResponse({ ...base, actionIdentifier: ACTIONS.swap, data: meal })).toEqual({
      type: 'navigate',
      url: '/eat?mealId=m1&swap=1',
    });
    expect(
      resolveResponse({ ...base, actionIdentifier: ACTIONS.start, data: { kind: 'workout', url: '/train', sessionId: 's 1' } }),
    ).toEqual({ type: 'navigate', url: '/train?sessionId=s%201&start=1' });
    expect(resolveResponse({ ...base, actionIdentifier: ACTIONS.manage, data: { kind: 'trial', url: '/settings/subscription' } })).toEqual({
      type: 'navigate',
      url: '/settings/subscription',
    });
    expect(resolveResponse({ ...base, actionIdentifier: ACTIONS.checkin, data: { kind: 'checkin', url: '/today' } })).toEqual({
      type: 'navigate',
      url: '/today?checkin=1',
    });
  });

  it('a plain tap opens the right screen', () => {
    expect(resolveResponse({ ...base, actionIdentifier: DEFAULT_ACTION, data: meal })).toEqual({
      type: 'navigate',
      url: '/eat?mealId=m1',
    });
    expect(
      resolveResponse({ ...base, actionIdentifier: DEFAULT_ACTION, data: { kind: 'workout', url: '/train', sessionId: 's1' } }),
    ).toEqual({ type: 'navigate', url: '/train?sessionId=s1' });
    expect(resolveResponse({ ...base, actionIdentifier: DEFAULT_ACTION, data: { kind: 'brief', url: '/today' } })).toEqual({
      type: 'navigate',
      url: '/today',
    });
    expect(resolveResponse({ ...base, actionIdentifier: DEFAULT_ACTION, data: null })).toEqual({
      type: 'navigate',
      url: '/today',
    });
    expect(resolveResponse({ ...base, actionIdentifier: 'unknown', data: 42 })).toEqual({ type: 'none' });
  });

  it('Snooze copies the reminder 10 minutes later with its buttons', () => {
    const r = resolveResponse({ ...base, actionIdentifier: ACTIONS.snooze, data: meal });
    expect(r).toMatchObject({
      type: 'snooze',
      minutes: 10,
      key: 'rw:snooze:rw:meal:2026-11-19:lunch',
      content: { title: 'Lunch time 🍽', channelId: 'meals', categoryId: 'meal', data: { kind: 'meal', mealId: 'm1' } },
    });
    // Snoozing a snoozed reminder keeps one id.
    const again = resolveResponse({
      ...base,
      identifier: 'rw:snooze:rw:meal:2026-11-19:lunch',
      actionIdentifier: ACTIONS.snooze,
      data: meal,
    });
    expect(again).toMatchObject({ key: 'rw:snooze:rw:meal:2026-11-19:lunch' });
  });

  it('parseData rejects unknown kinds and foreign urls', () => {
    expect(parseData({ kind: 'evil', url: '/x' })).toBeNull();
    expect(parseData({ kind: 'meal', url: 'https://evil.example' })?.url).toBe('/today');
    expect(parseData('x')).toBeNull();
  });

  it('responseKey is stable per delivery + action', () => {
    expect(responseKey({ identifier: 'a', actionIdentifier: 'ate', date: 1 })).toBe('a|ate|1');
    expect(workoutUrl(undefined, false)).toBe('/train');
  });
});

describe('planRestSurface', () => {
  const state: RestTimerState = {
    sessionId: 's1',
    workoutTitle: 'Push day',
    startedAt: 1_000,
    endsAt: 91_000,
    paused: false,
    remainingMs: null,
    nextExercise: 'Bench press',
    nextSet: 3,
  };

  it('shows the countdown and plans the Rest over alert at endsAt', () => {
    const p = planRestSurface(state, 31_000);
    expect(p).toMatchObject({
      type: 'show',
      alertAt: 91_000,
      alert: { title: 'Rest over', body: 'Next: Bench press set 3' },
      payload: { endsAt: 91_000, paused: false, remainingMs: 60_000, title: 'Resting', sessionId: 's1' },
    });
  });

  it('paused: frozen time, no alert', () => {
    const p = planRestSurface({ ...state, paused: true, remainingMs: 65_000 }, 50_000);
    expect(p).toMatchObject({ type: 'show', alertAt: null, payload: { paused: true, title: 'Rest paused · 1:05 left', endsAt: 115_000 } });
  });

  it('ends when cleared or over', () => {
    expect(planRestSurface(null, 0)).toEqual({ type: 'end' });
    expect(planRestSurface(state, 91_000)).toEqual({ type: 'end' });
  });
});
