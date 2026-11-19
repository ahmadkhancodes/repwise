import { epley1RM, muscleHeatmap, weightTrend } from '../logic/engine';
import {
  dayLabel,
  lastWeekStarts,
  localISODate,
  monthDates,
  shiftMonth,
  shortDate,
} from '../logic/dates';
import { measurementSeries, rangeStart, weightSeries, type BodyRow } from '../logic/body';
import {
  areaPath,
  labelIndices,
  layoutBars,
  layoutLines,
  linePath,
  niceDomain,
  tickLabel,
} from '../logic/chart';
import { historySections } from '../logic/history';
import {
  engineExerciseMap,
  rankMuscles,
  recoveryHeatmap,
  recoveryLabel,
  toSetLogs,
  weeklyMuscleVolume,
} from '../logic/muscles';
import { calorieSummary, dailyCalories, weeklyAdherence } from '../logic/nutrition';
import {
  daysApart,
  defaultComparePair,
  extensionOf,
  groupByMonth,
  orderPair,
  photoFileName,
} from '../logic/photos';
import { exerciseSessions, personalRecords, setE1rm, trainedExercises } from '../logic/strength';
import { monthCalendar, weekStreak, workoutsThisWeek } from '../logic/streak';
import {
  displayLength,
  displayWeight,
  formatLoad,
  formatWeight,
  parseDecimal,
  toCm,
  toKg,
  unitSystem,
} from '../logic/units';
import { flattenSets, sessionMinutes, tonnage } from '../logic/workouts';
import { isEmptyWrapped, monthlyWrapped, wrappedCards } from '../logic/wrapped';

import { at, exercises, sessionExercises, sessions, sets } from './fixtures';

const logged = flattenSets(sessions, sessionExercises, sets);
const exById = engineExerciseMap(exercises);

describe('workouts', () => {
  it('flattens only ticked sets of non-skipped sessions, ordered by time', () => {
    expect(logged).toHaveLength(7);
    expect(logged.map((s) => s.sessionId)).toEqual(['s1', 's1', 's1', 's2', 's2', 's3', 's3']);
    expect(logged[0]).toMatchObject({
      exerciseId: 'bench',
      date: '2026-11-02',
      type: 'warmup',
      weightKg: 40,
      reps: 10,
    });
  });

  it('tonnage counts work sets only (no warm-ups)', () => {
    expect(tonnage(logged.filter((s) => s.sessionId === 's1'))).toBe(960);
    expect(tonnage(logged)).toBe(960 + 500 + 500 + 625 + 500);
  });

  it('session minutes = end − start − paused', () => {
    expect(sessionMinutes(sessions[0]!)).toBe(50);
    expect(sessionMinutes({ ...sessions[0]!, pausedMs: 10 * 60_000 })).toBe(40);
    expect(sessionMinutes(sessions[3]!)).toBe(0);
  });
});

describe('strength (engine Epley)', () => {
  it('uses the engine e1RM and skips warm-ups and high-rep sets', () => {
    expect(setE1rm({ type: 'working', weightKg: 60, reps: 8 })).toBe(
      Math.round(epley1RM(60, 8) * 10) / 10,
    );
    expect(setE1rm({ type: 'working', weightKg: 60, reps: 8 })).toBe(76);
    expect(setE1rm({ type: 'warmup', weightKg: 60, reps: 8 })).toBeNull();
    expect(setE1rm({ type: 'working', weightKg: 40, reps: 15 })).toBeNull();
    expect(setE1rm({ type: 'working', weightKg: 0, reps: 8 })).toBeNull();
  });

  it('per-session bench series', () => {
    expect(exerciseSessions(logged, 'bench')).toEqual([
      expect.objectContaining({
        sessionId: 's1',
        e1rm: 76,
        topWeightKg: 60,
        topReps: 8,
        volumeKg: 960,
        sets: 2,
      }),
      expect.objectContaining({
        sessionId: 's2',
        e1rm: 79.2,
        topWeightKg: 62.5,
        topReps: 8,
        volumeKg: 500,
        sets: 1,
      }),
      expect.objectContaining({
        sessionId: 's3',
        e1rm: 83.3,
        topWeightKg: 62.5,
        topReps: 10,
        volumeKg: 625,
        sets: 1,
      }),
    ]);
  });

  it('PRs: first session is the baseline; weight PR, then e1RM PR; newest first', () => {
    const prs = personalRecords(logged);
    expect(prs).toEqual([
      expect.objectContaining({
        exerciseId: 'bench',
        sessionId: 's3',
        kind: 'e1rm',
        valueKg: 83.3,
        previousKg: 79.2,
      }),
      expect.objectContaining({
        exerciseId: 'bench',
        sessionId: 's2',
        kind: 'weight',
        valueKg: 62.5,
        reps: 8,
        previousKg: 60,
      }),
    ]);
  });

  it('trained exercises, most recent first, with e1RM change', () => {
    const list = trainedExercises(logged);
    expect(list.map((e) => e.exerciseId)).toEqual(['squat', 'bench']);
    expect(list[1]).toMatchObject({ sessions: 3, bestE1rm: 83.3, e1rmChange: 7.3 });
    expect(list[0]).toMatchObject({ sessions: 2, bestE1rm: 116.7, e1rmChange: 0 });
  });
});

describe('muscles (engine heatmap)', () => {
  it('drops muscles the engine does not model', () => {
    expect(
      (exById.get('squat') as unknown as { secondaryMuscles: string[] }).secondaryMuscles,
    ).toEqual(['glutes']);
  });

  it('recovery heatmap equals the engine call', () => {
    const now = at(10, 8);
    expect(recoveryHeatmap(logged, exById, now)).toEqual(
      muscleHeatmap(toSetLogs(logged), exById, now, 7),
    );
    const ranked = rankMuscles(recoveryHeatmap(logged, exById, now));
    // 7 days back from 10 Nov 08:00 drops the 2 Nov sets; quads (longer half-life) lead.
    expect(ranked[0]).toMatchObject({ muscle: 'quads', sets: 2 });
    expect(ranked.find((r) => r.muscle === 'chest')).toMatchObject({ sets: 2 });
    expect(ranked[ranked.length - 1]!.fatigue).toBe(0);
  });

  it('weekly hard-set credit per muscle (primary 1, secondary 0.5)', () => {
    const [w1, w2] = weeklyMuscleVolume(logged, exById, ['2026-11-02', '2026-11-09']);
    expect(w1!.weekStart).toBe('2026-11-02');
    expect(w1!.byMuscle).toMatchObject({
      chest: 3,
      triceps: 1.5,
      front_delts: 1.5,
      quads: 1,
      glutes: 0.5,
      biceps: 0,
    });
    expect(w1!.total).toBe(7.5);
    expect(w2!.byMuscle).toMatchObject({ chest: 1, quads: 1 });
    expect(w2!.total).toBe(3.5);
  });

  it('recovery labels', () => {
    expect(recoveryLabel(0.9)).toBe('Fresh');
    expect(recoveryLabel(0.5)).toBe('Recovering');
    expect(recoveryLabel(0.1)).toBe('Worked');
  });
});

const body = (
  date: string,
  weightKg: number | null,
  extra: Partial<BodyRow> = {},
  updatedAt = 0,
): BodyRow => ({
  id: `${date}-${updatedAt}`,
  date,
  weightKg,
  waistCm: null,
  hipsCm: null,
  chestCm: null,
  armCm: null,
  thighCm: null,
  neckCm: null,
  bodyFatPct: null,
  updatedAt,
  ...extra,
});

describe('body metrics', () => {
  const rows = [
    body('2026-11-01', 80, { waistCm: 85 }),
    body('2026-11-03', 81, {}, 1),
    body('2026-11-03', 80.4, {}, 2), // newer edit the same day wins
    body('2026-11-08', 79.8),
    body('2026-11-15', null, { waistCm: 84, bodyFatPct: 18.04 }),
    body('2026-09-01', 83),
  ];

  it('weight series uses the engine 7-day average and the range', () => {
    const s = weightSeries(rows, '1M', '2026-11-19', 'metric');
    expect(s.points).toEqual([
      { date: '2026-11-01', value: 80, avg: 80 },
      { date: '2026-11-03', value: 80.4, avg: 80.2 },
      { date: '2026-11-08', value: 79.8, avg: 80.1 },
    ]);
    const engine = weightTrend([
      { date: '2026-11-01', kg: 80 },
      { date: '2026-11-03', kg: 80.4 },
      { date: '2026-11-08', kg: 79.8 },
    ]);
    expect(s.points.map((p) => p.avg)).toEqual(engine.map((e) => Math.round(e.avgKg * 10) / 10));
    expect(s).toMatchObject({ current: 80.1, latest: 79.8, change: 0.1 });
    expect(weightSeries(rows, 'ALL', '2026-11-19', 'metric').points).toHaveLength(4);
  });

  it('weight series in pounds', () => {
    const s = weightSeries(rows, '1M', '2026-11-19', 'imperial');
    expect(s.points[0]).toEqual({ date: '2026-11-01', value: 176.4, avg: 176.4 });
  });

  it('measurements: only measures with data, deltas, imperial lengths', () => {
    const m = measurementSeries(rows, '1M', '2026-11-19', 'metric');
    expect(m.map((x) => x.key)).toEqual(['waistCm', 'bodyFatPct']);
    expect(m[0]).toMatchObject({ latest: 84, change: -1 });
    expect(m[1]).toMatchObject({ latest: 18, change: null });
    expect(measurementSeries(rows, '1M', '2026-11-19', 'imperial')[0]!.points[0]!.value).toBe(33.5);
  });

  it('range start', () => {
    expect(rangeStart('1M', '2026-11-19')).toBe('2026-10-21');
    expect(rangeStart('ALL', '2026-11-19')).toBeNull();
  });
});

describe('units', () => {
  it('converts and parses', () => {
    expect(unitSystem('imperial')).toBe('imperial');
    expect(unitSystem(null)).toBe('metric');
    expect(displayWeight(100, 'imperial')).toBe(220.5);
    expect(toKg(220.5, 'imperial')).toBe(100.02);
    expect(toKg(82.4, 'metric')).toBe(82.4);
    expect(displayLength(2.54, 'imperial')).toBe(1);
    expect(toCm(10, 'imperial')).toBe(25.4);
    expect(formatWeight(82.44, 'metric')).toBe('82.4 kg');
    expect(formatLoad(12450, 'metric')).toBe('12,450 kg');
    expect(parseDecimal('82,4')).toBe(82.4);
    expect(parseDecimal(' 0 ')).toBeNull();
    expect(parseDecimal('8a')).toBeNull();
    expect(parseDecimal('')).toBeNull();
  });
});

describe('adherence + calories', () => {
  const plans = [
    { id: 'p1', date: '2026-11-10', kcalTarget: 2000 },
    { id: 'p2', date: '2026-11-20', kcalTarget: 2000 },
  ];
  const meals = [
    { mealPlanId: 'p1', status: 'eaten' },
    { mealPlanId: 'p1', status: 'eaten' },
    { mealPlanId: 'p1', status: 'skipped' },
    { mealPlanId: 'p2', status: 'planned' }, // future: not due
  ];

  it('counts only what was due up to today', () => {
    const [w1, w2, w3] = weeklyAdherence(
      sessions,
      plans,
      meals,
      ['2026-11-02', '2026-11-09', '2026-11-16'],
      '2026-11-19',
    );
    expect(w1).toMatchObject({ workoutsDone: 2, workoutsPlanned: 2, mealsPlanned: 0, rate: 1 });
    expect(w2).toMatchObject({
      workoutsDone: 1,
      workoutsPlanned: 2,
      mealsEaten: 2,
      mealsPlanned: 3,
      rate: 0.6,
    });
    expect(w3).toMatchObject({ workoutsDone: 0, workoutsPlanned: 1, rate: 0 });
  });

  it('calories vs target per day', () => {
    const logs = [
      { date: '2026-11-10', kcal: 500 },
      { date: '2026-11-10', kcal: 1450 },
      { date: '2026-11-11', kcal: 900 },
    ];
    const days = dailyCalories(logs, plans, ['2026-11-09', '2026-11-10', '2026-11-11']);
    expect(days).toEqual([
      { date: '2026-11-09', kcal: 0, target: null },
      { date: '2026-11-10', kcal: 1950, target: 2000 },
      { date: '2026-11-11', kcal: 900, target: null },
    ]);
    expect(calorieSummary(days)).toEqual({ avg: 1425, onTarget: 1, logged: 2 });
  });
});

describe('streak + calendar', () => {
  const dates = ['2026-10-20', '2026-11-02', '2026-11-05', '2026-11-09'];
  it('weeks in a row; a running week never breaks it', () => {
    expect(weekStreak(dates, '2026-11-19')).toEqual({
      current: 2,
      longest: 2,
      thisWeekDone: false,
    });
    expect(weekStreak([...dates, '2026-10-27', '2026-11-17'], '2026-11-19')).toEqual({
      current: 5,
      longest: 5,
      thisWeekDone: true,
    });
    expect(weekStreak(dates, '2026-11-30')).toMatchObject({ current: 0, longest: 2 });
    expect(weekStreak([], '2026-11-19')).toEqual({ current: 0, longest: 0, thisWeekDone: false });
    expect(workoutsThisWeek(dates, '2026-11-10')).toBe(1);
  });

  it('November 2026 calendar starts on Sunday (6 leading blanks)', () => {
    const rows = monthCalendar(
      { year: 2026, month: 11 },
      new Set(['2026-11-02']),
      new Set(['2026-11-03']),
      '2026-11-19',
    );
    expect(rows).toHaveLength(6);
    expect(rows[0]!.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(rows[0]![6]).toMatchObject({ date: '2026-11-01', day: 1 });
    expect(rows[1]![0]).toMatchObject({ date: '2026-11-02', workout: true, logged: false });
    expect(rows[1]![1]).toMatchObject({ logged: true });
    expect(rows[3]![3]).toMatchObject({ date: '2026-11-19', isToday: true });
    expect(rows[3]![4]).toMatchObject({ isFuture: true });
  });
});

describe('chart geometry', () => {
  it('nice domains and ticks', () => {
    expect(niceDomain([79.8, 80.4])).toEqual({
      min: 79.8,
      max: 80.4,
      ticks: [79.8, 80, 80.2, 80.4],
    });
    expect(niceDomain([0, 950], 3, { zero: true })).toEqual({
      min: 0,
      max: 1000,
      ticks: [0, 500, 1000],
    });
    expect(niceDomain([5, 5])).toMatchObject({ min: 4.6, max: 5.4 });
    expect(niceDomain([])).toEqual({ min: 0, max: 1, ticks: [0, 1] });
  });

  it('line layout maps oldest-left and higher-up', () => {
    const frame = { width: 110, height: 100, padTop: 0, padBottom: 0, padLeft: 10, padRight: 0 };
    const l = layoutLines([[0, 50, 100]], frame, 2);
    expect(l.domain).toMatchObject({ min: 0, max: 100 });
    expect(l.series[0]).toEqual([
      { x: 10, y: 100 },
      { x: 60, y: 50 },
      { x: 110, y: 0 },
    ]);
    expect(linePath(l.series[0]!)).toBe('M10 100 L60 50 L110 0');
    expect(areaPath(l.series[0]!, 100)).toBe('M10 100 L60 50 L110 0 L110 100 L10 100 Z');
    const single = layoutLines([[7]], frame).series[0]![0]!;
    expect(single.x).toBe(60);
    expect(single.y).toBeCloseTo(50);
  });

  it('bars from a zero baseline with targets', () => {
    const frame = { width: 100, height: 100, padTop: 0, padBottom: 0, padLeft: 0, padRight: 0 };
    const b = layoutBars([0, 50, 100], frame, { gap: 5, targets: [null, 80, null] });
    expect(b.bars.map((x) => Math.round(x.height))).toEqual([0, 50, 100]);
    expect(b.bars[1]!.x).toBeCloseTo(35);
    expect(b.targetYs).toEqual([null, 20, null]);
  });

  it('labels', () => {
    expect(labelIndices(10, 4)).toEqual([0, 3, 6, 9]);
    expect(labelIndices(2, 4)).toEqual([0, 1]);
    expect(tickLabel(12450)).toBe('12k');
    expect(tickLabel(1500)).toBe('1.5k');
    expect(tickLabel(82.45)).toBe('82.5');
  });
});

describe('wrapped', () => {
  const input = {
    sessions,
    sets: logged,
    exById,
    mealsLogged: 41,
    loggedDates: ['2026-11-10', '2026-11-11'],
    today: '2026-11-19',
  };
  it('November recap matches the fixture', () => {
    const w = monthlyWrapped(input, { year: 2026, month: 11 });
    expect(w).toMatchObject({
      title: 'Your November',
      workouts: 3,
      minutes: 50 + 60 + 45,
      sets: 6,
      volumeKg: 3085,
      pianos: 7.7,
      activeDays: 5,
      favouriteExerciseId: 'bench',
      topMuscle: { muscle: 'chest', sets: 4 },
      streakWeeks: 2,
      mealsLogged: 41,
    });
    expect(w.prs).toHaveLength(2);
    expect(w.topPr).toMatchObject({ kind: 'weight', valueKg: 62.5 });
    expect(wrappedCards(w)).toEqual([
      'intro',
      'workouts',
      'volume',
      'prs',
      'muscle',
      'streak',
      'food',
      'summary',
    ]);
  });

  it('empty month', () => {
    const w = monthlyWrapped({ ...input, mealsLogged: 0 }, { year: 2026, month: 9 });
    expect(isEmptyWrapped(w)).toBe(true);
    expect(wrappedCards(w)).toEqual(['intro', 'summary']);
  });
});

describe('history', () => {
  it('groups workouts and food days, newest first', () => {
    const sections = historySections(sessions, logged, [
      { date: '2026-11-09', kcal: 2100.4 },
      { date: '2026-11-09', kcal: 10 },
    ]);
    expect(sections.map((s) => s.date)).toEqual(['2026-11-09', '2026-11-05', '2026-11-02']);
    expect(sections[0]!.data).toEqual([
      expect.objectContaining({
        kind: 'workout',
        title: 'Push',
        minutes: 45,
        volumeKg: 1125,
        sets: 2,
      }),
      expect.objectContaining({ kind: 'food', entries: 2, kcal: 2110 }),
    ]);
    expect(sections[2]!.data[0]).toMatchObject({ sets: 2, volumeKg: 960 });
  });
});

describe('photos', () => {
  const p = (id: string, date: string, pose: string | null, createdAt = 0) => ({
    id,
    date,
    pose,
    localUri: `file:///${id}.jpg`,
    createdAt,
  });
  it('names, groups and pairs', () => {
    expect(photoFileName('0193-ab/..', 'JPEG')).toBe('0193-ab.jpg');
    expect(extensionOf('file:///a/IMG_1.HEIC')).toBe('heic');
    expect(extensionOf('content://x')).toBe('jpg');
    const list = [
      p('a', '2026-09-01', 'front'),
      p('b', '2026-10-01', 'side'),
      p('c', '2026-11-01', 'side'),
      p('d', '2026-11-10', null, 5),
    ];
    expect(groupByMonth(list).map((g) => [g.title, g.data.map((x) => x.id)])).toEqual([
      ['November 2026', ['d', 'c']],
      ['October 2026', ['b']],
      ['September 2026', ['a']],
    ]);
    expect(defaultComparePair(list)!.map((x) => x.id)).toEqual(['a', 'd']);
    expect(defaultComparePair(list.slice(0, 3))!.map((x) => x.id)).toEqual(['b', 'c']);
    expect(defaultComparePair(list.slice(0, 1))).toBeNull();
    expect(orderPair(list[2]!, list[0]!).map((x) => x.id)).toEqual(['a', 'c']);
    expect(daysApart('2026-09-01', '2026-11-10')).toBe(70);
  });
});

describe('dates', () => {
  it('local helpers', () => {
    expect(localISODate(at(2, 23, 59))).toBe('2026-11-02');
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(monthDates({ year: 2028, month: 2 })).toHaveLength(29);
    expect(lastWeekStarts('2026-11-19', 3)).toEqual(['2026-11-02', '2026-11-09', '2026-11-16']);
    expect(shortDate('2026-11-08')).toBe('8 Nov');
    expect(dayLabel('2026-11-19')).toBe('Thu 19 Nov');
  });
});
