import { DEFAULT_PREFS, type NotificationPrefs } from '../prefs';
import {
  applyQuiet,
  buildSchedule,
  inQuiet,
  MAX_SCHEDULED,
  notificationHash,
  quietWindow,
  type DayPlan,
  type ScheduleInput,
} from '../schedule';
import { wallClock, zonedTimeToUtc } from '../zonedTime';

const TZ = 'Europe/London';
// Thursday 19 Nov 2026, 06:00 London (GMT).
const NOW = Date.UTC(2026, 10, 19, 6, 0);

function day(date: string, opts: Partial<DayPlan> = {}): DayPlan {
  return {
    date,
    workout: { sessionId: `s-${date}`, title: 'Leg day', exercises: 6, minutes: 52, status: 'planned' },
    meals: [
      { mealId: `b-${date}`, slot: 'breakfast', name: 'Oats', kcal: 420, protein: 25, status: 'planned' },
      { mealId: `l-${date}`, slot: 'lunch', name: 'Chicken karahi bowl', kcal: 610, protein: 48, status: 'planned' },
      { mealId: `s-${date}m`, slot: 'snack', name: 'Greek yoghurt', kcal: 180, protein: 18, status: 'planned' },
      { mealId: `d-${date}`, slot: 'dinner', name: 'Salmon rice', kcal: 650, protein: 42, status: 'planned' },
    ],
    ...opts,
  };
}

function input(o: Partial<ScheduleInput> = {}, prefs: Partial<NotificationPrefs> = {}): ScheduleInput {
  return {
    now: NOW,
    timeZone: TZ,
    prefs: { ...DEFAULT_PREFS, ...prefs },
    permitted: true,
    isPro: true,
    days: [day('2026-11-19'), day('2026-11-20')],
    ...o,
  };
}

const at = (date: string, hm: string, tz = TZ) => {
  const [h, m] = hm.split(':').map(Number);
  return zonedTimeToUtc(date, h! * 60 + m!, tz);
};

describe('buildSchedule', () => {
  it('builds the full day from sheet 17 with copy, channels and categories', () => {
    const list = buildSchedule(input());
    const today = list.filter((n) => n.data.date === '2026-11-19' || n.key.endsWith('2026-11-19'));
    const byKey = Object.fromEntries(list.map((n) => [n.key, n]));

    expect(byKey['rw:brief:2026-11-19']).toMatchObject({
      at: at('2026-11-19', '07:15'),
      title: 'Leg day · 52 min',
      body: 'Lunch: Chicken karahi bowl · 610 kcal',
      channelId: 'brief',
    });
    expect(byKey['rw:meal:2026-11-19:lunch']).toMatchObject({
      at: at('2026-11-19', '13:00'),
      title: 'Lunch time 🍽',
      body: 'Chicken karahi bowl · 610 kcal · 48 g protein',
      channelId: 'meals',
      categoryId: 'meal',
      data: { kind: 'meal', mealId: 'l-2026-11-19', url: '/eat', slot: 'lunch' },
    });
    expect(byKey['rw:workout:2026-11-19']).toMatchObject({
      at: at('2026-11-19', '17:30'),
      title: 'Leg day in 30 min',
      body: '6 exercises · 52 min',
      channelId: 'training',
      categoryId: 'workout',
      data: { sessionId: 's-2026-11-19' },
    });
    expect(byKey['rw:fuel:2026-11-19']).toMatchObject({
      at: at('2026-11-19', '17:00'),
      title: 'Fuel up',
      body: 'Greek yoghurt 60 min before training',
    });
    expect(byKey['rw:evening:2026-11-19']).toMatchObject({
      at: at('2026-11-19', '20:30'),
      title: 'Tomorrow: Leg day',
      body: '6 exercises · 52 min · Breakfast: Oats',
      data: { date: '2026-11-20' },
    });
    expect(today.length).toBeGreaterThanOrEqual(8);
    // Sorted soonest first.
    expect(list.map((n) => n.at)).toEqual([...list.map((n) => n.at)].sort((a, b) => a - b));
  });

  it('schedules nothing without permission', () => {
    expect(buildSchedule(input({ permitted: false }))).toEqual([]);
  });

  it('skips past reminders and anything in the next 30 s', () => {
    const list = buildSchedule(input({ now: at('2026-11-19', '13:00') - 10_000 }));
    expect(list.find((n) => n.key === 'rw:brief:2026-11-19')).toBeUndefined();
    expect(list.find((n) => n.key === 'rw:meal:2026-11-19:breakfast')).toBeUndefined();
    expect(list.find((n) => n.key === 'rw:meal:2026-11-19:lunch')).toBeUndefined();
    expect(list.find((n) => n.key === 'rw:meal:2026-11-19:dinner')).toBeDefined();
  });

  it('only reminds for planned meals and planned workouts', () => {
    const d = day('2026-11-19');
    d.meals[1]!.status = 'eaten';
    d.workout!.status = 'done';
    const keys = buildSchedule(input({ days: [d] })).map((n) => n.key);
    expect(keys).not.toContain('rw:meal:2026-11-19:lunch');
    expect(keys).toContain('rw:meal:2026-11-19:dinner');
    expect(keys).not.toContain('rw:workout:2026-11-19');
    expect(keys).not.toContain('rw:fuel:2026-11-19');
  });

  it('rest day: brief says Rest day; no workout or fuel reminder', () => {
    const list = buildSchedule(input({ days: [day('2026-11-19', { workout: null })] }));
    const brief = list.find((n) => n.key === 'rw:brief:2026-11-19');
    expect(brief?.title).toBe('Rest day');
    expect(list.some((n) => n.kind === 'workout' || n.kind === 'fuel')).toBe(false);
  });

  it('days without a plan get no brief/meal reminders', () => {
    const list = buildSchedule(input({ days: [] }));
    expect(list.some((n) => ['brief', 'meal', 'workout', 'evening'].includes(n.kind))).toBe(false);
  });

  it('respects each toggle', () => {
    const list = buildSchedule(
      input({}, { brief: false, meals: false, workout: false, fuel: false, evening: false, checkin: false }),
    );
    expect(list).toEqual([]);
  });

  it('free users get brief, workout and check-in; Pro adds meals, fuel and evening (RW-43)', () => {
    const kinds = new Set(buildSchedule(input({ isPro: false })).map((n) => n.kind));
    expect(kinds.has('brief')).toBe(true);
    expect(kinds.has('workout')).toBe(true);
    expect(kinds.has('meal')).toBe(false);
    expect(kinds.has('fuel')).toBe(false);
    expect(kinds.has('evening')).toBe(false);
  });

  it('uses profile meal times, and screen overrides win', () => {
    const list = buildSchedule(
      input({ profileMealTimes: ['lunch=12:30', 'dinner=19:00'] }, { mealTimes: { dinner: '18:45' } }),
    );
    const k = (s: string) => list.find((n) => n.key === `rw:meal:2026-11-19:${s}`)?.at;
    expect(k('lunch')).toBe(at('2026-11-19', '12:30'));
    expect(k('dinner')).toBe(at('2026-11-19', '18:45'));
  });

  it('weekly check-in on the chosen weekday (default Sunday)', () => {
    const list = buildSchedule(input({ days: [] }));
    const checkins = list.filter((n) => n.kind === 'checkin');
    expect(checkins).toHaveLength(1);
    expect(checkins[0]).toMatchObject({
      key: 'rw:checkin:2026-11-22',
      at: at('2026-11-22', '18:00'),
      title: 'Your week in 30 seconds',
      body: 'Check in to tune next week',
      categoryId: 'checkin',
    });
    const wed = buildSchedule(input({ days: [] }, { checkinDay: 3 })).filter((n) => n.kind === 'checkin');
    expect(wed[0]?.key).toBe('rw:checkin:2026-11-25');
  });

  it('fires at the right local time in another zone (DST + half-hour offsets)', () => {
    const tz = 'America/New_York';
    const now = Date.UTC(2026, 2, 7, 12); // 7 Mar 07:00 EST, the day before spring forward
    const list = buildSchedule(
      input({ now, timeZone: tz, days: [day('2026-03-07'), day('2026-03-08')] }),
    );
    for (const date of ['2026-03-07', '2026-03-08']) {
      const lunch = list.find((n) => n.key === `rw:meal:${date}:lunch`)!;
      expect(wallClock(lunch.at, tz)).toMatchObject({ date, minute: 13 * 60 });
    }
    const kolkata = buildSchedule(input({ timeZone: 'Asia/Kolkata', now: Date.UTC(2026, 10, 18, 20) }));
    const lunch = kolkata.find((n) => n.key === 'rw:meal:2026-11-19:lunch')!;
    expect(new Date(lunch.at).toISOString()).toBe('2026-11-19T07:30:00.000Z');
  });

  it('caps the schedule for the iOS 64 limit and keeps the trial reminder', () => {
    const days = Array.from({ length: 8 }, (_, i) => day(`2026-11-${19 + i}`));
    const list = buildSchedule(
      input({
        days,
        trial: { inTrial: true, autoRenew: true, expiresAt: NOW + 6 * 86_400_000 },
      }),
    );
    expect(list.length).toBeLessThanOrEqual(MAX_SCHEDULED);
    expect(list.some((n) => n.kind === 'trial')).toBe(true);
  });

  it('trial reminder: 2 days before the end; not when cancelled or converted', () => {
    const expiresAt = NOW + 5 * 86_400_000 + 3 * 3_600_000; // 24 Nov 09:00 London
    const trial = buildSchedule(input({ days: [], trial: { inTrial: true, autoRenew: true, expiresAt } })).find(
      (n) => n.kind === 'trial',
    );
    expect(trial).toMatchObject({
      title: 'Your free trial ends in 2 days',
      body: 'Keep Repwise Pro or cancel in one tap.',
      channelId: 'account',
      categoryId: 'trial',
      data: { url: '/settings/subscription' },
    });
    expect(expiresAt - trial!.at).toBeGreaterThanOrEqual(2 * 86_400_000 - 1);
    expect(
      buildSchedule(input({ days: [], trial: { inTrial: true, autoRenew: false, expiresAt } })).some(
        (n) => n.kind === 'trial',
      ),
    ).toBe(false);
    expect(
      buildSchedule(input({ days: [], trial: { inTrial: false, autoRenew: true, expiresAt } })).some(
        (n) => n.kind === 'trial',
      ),
    ).toBe(false);
  });

  it('hash changes when content or time changes', () => {
    const [a] = buildSchedule(input());
    expect(notificationHash(a!)).toBe(notificationHash({ ...a! }));
    expect(notificationHash({ ...a!, body: 'x' })).not.toBe(notificationHash(a!));
    expect(notificationHash({ ...a!, at: a!.at + 60_000 })).not.toBe(notificationHash(a!));
  });
});

describe('quiet hours', () => {
  const q = quietWindow(DEFAULT_PREFS)!; // 22:00–07:00

  it('detects wrapping and non-wrapping windows', () => {
    expect(inQuiet(23 * 60, q)).toBe(true);
    expect(inQuiet(6 * 60 + 59, q)).toBe(true);
    expect(inQuiet(7 * 60, q)).toBe(false);
    expect(inQuiet(13 * 60, { start: 12 * 60, end: 14 * 60 })).toBe(true);
    expect(inQuiet(13 * 60, null)).toBe(false);
    expect(quietWindow({ ...DEFAULT_PREFS, quietEnabled: false })).toBeNull();
  });

  it('moves the brief to the end of quiet hours, drops meals, moves evening earlier', () => {
    expect(applyQuiet('2026-11-19', 6 * 60 + 15, q, 'later')).toEqual({ date: '2026-11-19', minute: 7 * 60 });
    expect(applyQuiet('2026-11-19', 23 * 60, q, 'later')).toEqual({ date: '2026-11-20', minute: 7 * 60 });
    expect(applyQuiet('2026-11-19', 22 * 60 + 30, q, 'drop')).toBeNull();
    expect(applyQuiet('2026-11-19', 22 * 60 + 30, q, 'earlier')).toEqual({ date: '2026-11-19', minute: 21 * 60 + 59 });
    expect(applyQuiet('2026-11-19', 60, q, 'earlier')).toEqual({ date: '2026-11-18', minute: 21 * 60 + 59 });
    expect(applyQuiet('2026-11-19', 12 * 60, q, 'drop')).toEqual({ date: '2026-11-19', minute: 12 * 60 });
  });

  it('applies to the built schedule', () => {
    const list = buildSchedule(
      input({}, { wakeTime: '06:00', eveningTime: '22:30', mealTimes: { dinner: '22:15' } }),
    );
    const k = (key: string) => list.find((n) => n.key === key);
    expect(k('rw:brief:2026-11-19')?.at).toBe(at('2026-11-19', '07:00'));
    expect(k('rw:meal:2026-11-19:dinner')).toBeUndefined();
    expect(k('rw:evening:2026-11-19')?.at).toBe(at('2026-11-19', '21:59'));
    const noQuiet = buildSchedule(input({}, { wakeTime: '06:00', quietEnabled: false }));
    expect(noQuiet.find((n) => n.key === 'rw:brief:2026-11-19')?.at).toBe(at('2026-11-19', '06:15'));
  });
});
