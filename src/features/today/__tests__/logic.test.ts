import { briefRows, eveningSummary, showEvening, tomorrowPreview } from '../logic/brief';
import {
  clockMinutes,
  dayPhase,
  greeting,
  localDate,
  longDate,
  tomorrowOf,
  weekdayName,
  weekdaySun0,
} from '../logic/day';
import {
  addNutrients,
  assignTimes,
  countEaten,
  dayTargets,
  mealMeta,
  nextMeal,
  portionNutrients,
  ratio,
  remaining,
  slotLabel,
  sumNutrients,
} from '../logic/meals';
import {
  DEFAULT_GOAL_GLASSES,
  GLASS_ML,
  isWaterLog,
  waterGlasses,
  waterLogName,
  waterMlOf,
  waterTotalMl,
} from '../logic/water';
import { estimateMinutes, humanize, pickTodaySession, topMuscles, totalSets, workoutMeta } from '../logic/workout';

describe('day', () => {
  it('local date honours the UTC offset (late evening in New York is still that day)', () => {
    const utc = Date.UTC(2026, 10, 20, 2, 30); // 02:30 UTC on 20 Nov
    expect(localDate(utc, -300)).toBe('2026-11-19');
    expect(localDate(utc, 60)).toBe('2026-11-20');
    expect(localDate(new Date(2026, 10, 19, 23, 59).getTime())).toBe('2026-11-19');
  });

  it('phases and greetings', () => {
    expect(dayPhase(0)).toBe('morning');
    expect(dayPhase(11)).toBe('morning');
    expect(dayPhase(12)).toBe('afternoon');
    expect(dayPhase(17)).toBe('afternoon');
    expect(dayPhase(18)).toBe('evening');
    expect(greeting('morning', 'Sam Lee')).toBe('Good morning, Sam');
    expect(greeting('evening', '  ')).toBe('Good evening');
    expect(greeting('afternoon', null)).toBe('Good afternoon');
  });

  it('weekday names and long dates are zone independent', () => {
    expect(weekdaySun0('2026-11-19')).toBe(4);
    expect(weekdayName('2026-11-22')).toBe('Sunday');
    expect(longDate('2026-11-19')).toBe('Thursday 19 November');
    expect(tomorrowOf('2026-12-31')).toBe('2027-01-01');
    expect(tomorrowOf('2026-03-28')).toBe('2026-03-29'); // DST week in Europe
  });

  it('parses clock times', () => {
    expect(clockMinutes('13:05')).toBe(785);
    expect(clockMinutes('7:00')).toBe(420);
    expect(clockMinutes('24:00')).toBeNull();
    expect(clockMinutes('noon')).toBeNull();
    expect(clockMinutes(null)).toBeNull();
  });
});

describe('workout', () => {
  const s = (id: string, status: 'planned' | 'active' | 'done' | 'skipped' | null) => ({ id, status, title: id });

  it('picks the session in progress, then planned, then done; never skipped', () => {
    expect(pickTodaySession([s('a', 'done'), s('b', 'planned')])?.id).toBe('b');
    expect(pickTodaySession([s('a', 'planned'), s('b', 'active')])?.id).toBe('b');
    expect(pickTodaySession([s('a', 'skipped')])).toBeUndefined();
    expect(pickTodaySession([s('a', null)])?.id).toBe('a');
    expect(pickTodaySession([])).toBeUndefined();
  });

  it('estimates minutes from sets and rest, rounded to 5', () => {
    expect(estimateMinutes([])).toBe(0);
    // 3 sets × 40 s + 2 × 90 s = 300 s = 5 min + 5 overhead = 10
    expect(estimateMinutes([{ exerciseId: 'x', targetSets: 3, restS: 90 }])).toBe(10);
    const six = Array.from({ length: 6 }, () => ({ exerciseId: 'x', targetSets: 4, restS: 120 }));
    // 6 × (160 + 360) s = 52 min + 5 = 57 → 55
    expect(estimateMinutes(six)).toBe(55);
    expect(estimateMinutes([{ exerciseId: 'x', targetSets: null, restS: null }])).toBe(10);
    expect(totalSets([{ exerciseId: 'x', targetSets: null, restS: null }, { exerciseId: 'y', targetSets: 5, restS: 60 }])).toBe(8);
  });

  it('top muscles by count and humanised names', () => {
    expect(topMuscles([['chest', 'triceps'], ['chest', 'front_delts'], ['triceps'], ['lats']], 3)).toEqual([
      'Chest',
      'Triceps',
      'Front delts',
    ]);
    expect(humanize('rear-delts')).toBe('Rear delts');
    expect(humanize('')).toBe('');
    expect(workoutMeta(52, 6)).toBe('52 min · 6 exercises');
    expect(workoutMeta(0, 1)).toBe('1 exercise');
  });
});

describe('meals', () => {
  const per = { kcal: 644, protein: 47.9, carbs: 65.4, fat: 20.9 };

  it('scales one portion', () => {
    expect(portionNutrients(per, 1)).toEqual({ kcal: 644, p: 47.9, c: 65.4, f: 20.9 });
    expect(portionNutrients(per, 1.5)).toEqual({ kcal: 966, p: 71.9, c: 98.1, f: 31.4 });
    expect(portionNutrients(per, 0)).toEqual(portionNutrients(per, 1));
    expect(portionNutrients(undefined, 1)).toEqual({ kcal: 0, p: 0, c: 0, f: 0 });
  });

  it('sums nutrients without float drift', () => {
    const a = { kcal: 100, p: 0.1, c: 0.2, f: 0.3 };
    expect(addNutrients(a, a)).toEqual({ kcal: 200, p: 0.2, c: 0.4, f: 0.6 });
    expect(sumNutrients([a, a, a]).p).toBe(0.3);
  });

  it('assigns meal times only when every meal gets one', () => {
    const meals = [{ slot: 'breakfast' }, { slot: 'lunch' }, { slot: 'dinner' }];
    expect(assignTimes(meals, ['08:00', '13:00', '19:30'])).toEqual(['08:00', '13:00', '19:30']);
    expect(assignTimes(meals, ['08:00', '13:00'])).toEqual([null, null, null]);
    expect(assignTimes(meals, ['08:00', 'bad', '13:00', '19:30'])).toEqual(['08:00', '13:00', '19:30']);
    expect(assignTimes(meals, null)).toEqual([null, null, null]);
  });

  it('next meal is the first planned one not long past', () => {
    const m = (time: string | null, status: 'planned' | 'eaten' | 'skipped' | 'swapped') => ({ time, status });
    const day = [m('08:00', 'eaten'), m('13:00', 'planned'), m('19:00', 'planned')];
    expect(nextMeal(day, 10 * 60)).toBe(day[1]);
    expect(nextMeal(day, 14 * 60)).toBe(day[1]); // within 60 min
    expect(nextMeal(day, 15 * 60)).toBe(day[2]);
    expect(nextMeal(day, 23 * 60)).toBe(day[1]); // all past: first planned
    expect(nextMeal([m('08:00', 'eaten')], 600)).toBeUndefined();
    expect(nextMeal([m(null, 'swapped')], 600)?.status).toBe('swapped');
  });

  it('targets come from the meal plan, else planned totals', () => {
    const planned = { kcal: 2000, p: 150, c: 200, f: 60 };
    expect(dayTargets({ kcalTarget: 2300, macros: { protein: 160, carbs: 250, fat: 70 } }, planned)).toEqual({
      kcal: 2300,
      p: 160,
      c: 250,
      f: 70,
    });
    expect(dayTargets({ kcalTarget: 2300, macros: null }, planned)).toEqual({ kcal: 2300, p: 150, c: 200, f: 60 });
    expect(dayTargets(undefined, planned)).toEqual(planned);
    expect(dayTargets(undefined, { kcal: 0, p: 0, c: 0, f: 0 })).toBeNull();
  });

  it('ratio, remaining, counts and labels', () => {
    expect(ratio(500, 2000)).toBe(0.25);
    expect(ratio(3000, 2000)).toBe(1);
    expect(ratio(10, 0)).toBe(0);
    expect(remaining(500, 2000)).toBe(1500);
    expect(remaining(2500, 2000)).toBe(0);
    expect(countEaten([{ status: 'eaten' }, { status: 'planned' }])).toBe(1);
    expect(slotLabel('breakfast')).toBe('Breakfast');
    expect(mealMeta({ kcal: 1240, p: 47.6, c: 0, f: 0 })).toBe('1,240 kcal · 48 g protein');
  });
});

describe('water', () => {
  it('reads amounts from names and totals only water rows', () => {
    expect(waterLogName()).toBe(`Water ${GLASS_ML} ml`);
    expect(waterMlOf('Water 500 ml')).toBe(500);
    expect(waterMlOf('Water')).toBe(GLASS_ML);
    expect(isWaterLog({ slot: 'water' })).toBe(true);
    expect(isWaterLog({ slot: 'lunch' })).toBe(false);
    const rows = [
      { slot: 'water', name: 'Water 250 ml' },
      { slot: 'water', name: 'Water 500 ml' },
      { slot: 'lunch', name: 'Chicken karahi' },
    ];
    expect(waterTotalMl(rows)).toBe(750);
  });

  it('glasses are capped at the goal', () => {
    expect(waterGlasses(750)).toEqual({ filled: 3, goal: DEFAULT_GOAL_GLASSES, goalMl: 2000 });
    expect(waterGlasses(5000).filled).toBe(DEFAULT_GOAL_GLASSES);
    expect(waterGlasses(0, 6)).toEqual({ filled: 0, goal: 6, goalMl: 1500 });
  });
});

describe('brief + evening', () => {
  it('W2 rows: workout then next meal', () => {
    const rows = briefRows({
      workout: { title: 'Push day', minutes: 55, exercises: 6, done: false },
      restDay: false,
      nextMeal: { time: '13:00', title: 'Chicken karahi', kcal: 644 },
      mealsLeft: 3,
    });
    expect(rows).toEqual([
      { kind: 'workout', title: 'Push day', meta: '55 min · 6 exercises' },
      { kind: 'meal', title: 'Chicken karahi', meta: '13:00 · 644 kcal' },
    ]);
  });

  it('rest day, finished workout and all meals logged', () => {
    expect(briefRows({ workout: null, restDay: true, nextMeal: null, mealsLeft: 0 })).toEqual([
      { kind: 'rest', title: 'Rest day', meta: 'Recovery is part of the plan' },
      { kind: 'done', title: 'All meals logged', meta: 'Nothing left to eat today' },
    ]);
    const done = briefRows({
      workout: { title: 'Legs', minutes: 50, exercises: 5, done: true },
      restDay: false,
      nextMeal: { time: null, title: 'Oats', kcal: 400 },
      mealsLeft: 1,
    });
    expect(done[0]).toEqual({ kind: 'done', title: 'Legs', meta: 'Done today' });
    expect(done[1]?.meta).toBe('Next · 400 kcal');
    expect(briefRows({ workout: null, restDay: false, nextMeal: null, mealsLeft: 2 })).toEqual([]);
  });

  it('evening summary is supportive and complete', () => {
    const targets = { kcal: 2000, p: 150, c: 200, f: 60 };
    const all = eveningSummary({
      workout: { done: true },
      mealsEaten: 4,
      mealsTotal: 4,
      eaten: { kcal: 2000, p: 151, c: 200, f: 60 },
      targets,
    });
    expect(all.headline).toBe('Everything done. Nice work.');
    expect(all.items.map((i) => i.label)).toEqual(['Workout done', '4 of 4 meals eaten', 'Protein target hit']);
    const some = eveningSummary({
      workout: { done: false },
      mealsEaten: 2,
      mealsTotal: 4,
      eaten: { kcal: 900, p: 100, c: 0, f: 0 },
      targets,
    });
    expect(some.headline).toBe('There is still time today');
    expect(some.items[2]?.label).toBe('50 g protein to go');
    expect(eveningSummary({ workout: null, mealsEaten: 0, mealsTotal: 0, eaten: { kcal: 0, p: 0, c: 0, f: 0 }, targets: null }).headline).toBe('A calm day');
    const partial = eveningSummary({ workout: { done: true }, mealsEaten: 1, mealsTotal: 3, eaten: { kcal: 0, p: 0, c: 0, f: 0 }, targets: null });
    expect(partial.headline).toBe('Good progress today');
  });

  it('tomorrow preview', () => {
    expect(
      tomorrowPreview({
        workout: { title: 'Pull day', minutes: 50, exercises: 5 },
        hasPlan: true,
        firstMeal: { title: 'Oats', time: '08:00' },
      }),
    ).toEqual({ title: 'Pull day', meta: '50 min · 5 exercises · 08:00 Oats', restDay: false });
    expect(tomorrowPreview({ workout: null, hasPlan: true, firstMeal: null })).toEqual({
      title: 'Rest day',
      meta: 'Recovery is part of the plan',
      restDay: true,
    });
    expect(tomorrowPreview({ workout: null, hasPlan: false, firstMeal: null })).toBeNull();
    expect(showEvening('evening', false)).toBe(true);
    expect(showEvening('morning', true)).toBe(true);
    expect(showEvening('afternoon', false)).toBe(false);
  });
});
