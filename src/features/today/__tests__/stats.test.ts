import {
  buildStats,
  clampStepsGoal,
  DEFAULT_STEPS_GOAL,
  formatVolume,
  formatWeightDelta,
  ratio,
  weekVolumeKg,
  weightTrend,
  type StatsInput,
} from '../logic/stats';

const base: StatsInput = {
  eatenKcal: 1240,
  targetKcal: 2300,
  eatenProtein: 92,
  targetProtein: 160,
  steps: { kind: 'on', steps: 6420 },
  stepsGoal: 8000,
  week: { planned: 4, done: 2 },
  streakWeeks: 3,
  volumeKg: 12450,
  weight: { values: [82, 81.6, 81.2], latestKg: 81.2, deltaKg: -0.8 },
  units: 'metric',
};

const tile = (i: StatsInput, id: string) => buildStats(i).find((t) => t.id === id)!;

describe('ratio', () => {
  it('clamps to [0, 1] and never returns NaN', () => {
    expect(ratio(50, 100)).toBe(0.5);
    expect(ratio(150, 100)).toBe(1);
    expect(ratio(10, 0)).toBe(0);
    expect(ratio(-5, 100)).toBe(0);
    expect(ratio(Number.NaN, 100)).toBe(0);
  });
});

describe('clampStepsGoal', () => {
  it('snaps to 500 and clamps; junk falls back to 8,000', () => {
    expect(DEFAULT_STEPS_GOAL).toBe(8000);
    expect(clampStepsGoal(8240)).toBe(8000);
    expect(clampStepsGoal(8260)).toBe(8500);
    expect(clampStepsGoal(10)).toBe(1000);
    expect(clampStepsGoal(999_999)).toBe(50000);
    expect(clampStepsGoal(Number.NaN)).toBe(8000);
    expect(clampStepsGoal(0)).toBe(8000);
  });
});

describe('weekVolumeKg', () => {
  const row = (sessionDate: string, weightKg: number, reps: number, type = 'working', doneAt: number | null = 1) => ({
    sessionDate,
    weightKg,
    reps,
    type,
    doneAt,
  });
  it('sums weight × reps of finished work sets inside the week only', () => {
    const rows = [
      row('2026-11-16', 100, 5), // 500
      row('2026-11-18', 60, 10), // 600
      row('2026-11-18', 40, 10, 'warmup'), // warm-up: no
      row('2026-11-18', 0, 30, 'cardio'), // cardio: no
      row('2026-11-19', 80, 8, 'working', null), // not done: no
      row('2026-11-15', 200, 5), // last week: no
      row('2026-11-23', 200, 5), // next week: no
      row('2026-11-20', 22.5, 12, 'drop'), // 270
    ];
    expect(weekVolumeKg(rows, '2026-11-16', '2026-11-22')).toBe(1370);
  });
  it('is 0 for an empty week', () => {
    expect(weekVolumeKg([], '2026-11-16', '2026-11-22')).toBe(0);
  });
});

describe('weightTrend', () => {
  it('one value per date (the last row wins), window only, delta = last − first', () => {
    const t = weightTrend(
      [
        { date: '2026-10-01', weightKg: 90 }, // before the window
        { date: '2026-11-01', weightKg: 82 },
        { date: '2026-11-10', weightKg: 81.9 },
        { date: '2026-11-10', weightKg: 81.5 },
        { date: '2026-11-19', weightKg: 81.2 },
        { date: '2026-11-20', weightKg: 70 }, // after today
        { date: '2026-11-12', weightKg: null },
      ],
      '2026-11-19',
      '2026-10-20',
    );
    expect(t.values).toEqual([82, 81.5, 81.2]);
    expect(t.latestKg).toBe(81.2);
    expect(t.deltaKg).toBe(-0.8);
  });
  it('no delta with a single weigh-in; empty without any', () => {
    expect(weightTrend([{ date: '2026-11-19', weightKg: 80 }], '2026-11-19', '2026-10-20').deltaKg).toBeNull();
    expect(weightTrend([], '2026-11-19', '2026-10-20')).toEqual({ values: [], latestKg: null, deltaKg: null });
  });
});

describe('formatting', () => {
  it('volume compacts above 10,000 and converts to lb', () => {
    expect(formatVolume(8420, 'metric')).toBe('8,420 kg');
    expect(formatVolume(12450, 'metric')).toBe('12.4 t');
    expect(formatVolume(1000, 'imperial')).toBe('2,205 lb');
    expect(formatVolume(12450, 'imperial')).toBe('27.4k lb');
  });
  it('weight delta is signed', () => {
    expect(formatWeightDelta(-0.8, 'metric')).toBe('−0.8 kg');
    expect(formatWeightDelta(1.2, 'metric')).toBe('+1.2 kg');
    expect(formatWeightDelta(0.01, 'metric')).toBe('No change');
    expect(formatWeightDelta(-1, 'imperial')).toBe('−2.2 lb');
  });
});

describe('buildStats', () => {
  it('every tile, in order, with tabular values and spoken labels', () => {
    const tiles = buildStats(base);
    expect(tiles.map((t) => t.id)).toEqual(['calories', 'protein', 'steps', 'workouts', 'streak', 'volume', 'weight']);
    const [kcal, protein, steps, workouts, streak, volume, weight] = tiles;
    expect(kcal).toMatchObject({ value: '1,240', detail: 'of 2,300 kcal' });
    expect(kcal!.progress).toBeCloseTo(1240 / 2300);
    expect(kcal!.a11y).toBe('Calories: 1,240 of 2,300 kcal eaten');
    expect(protein).toMatchObject({ value: '92 g', detail: 'of 160 g' });
    expect(steps).toMatchObject({ value: '6,420', detail: 'of 8,000' });
    expect(steps!.progress).toBeCloseTo(0.8025);
    expect(workouts).toMatchObject({ value: '2/4', detail: 'workouts', progress: 0.5 });
    expect(streak).toMatchObject({ value: '3', detail: 'weeks', progress: null });
    expect(volume).toMatchObject({ value: '12.4 t', detail: 'lifted this week' });
    expect(weight).toMatchObject({ value: '81.2 kg', detail: '−0.8 kg · 30 days' });
    expect(tiles.some((t) => t.action)).toBe(false);
  });

  it('no targets yet: no NaN, no progress', () => {
    const k = tile({ ...base, targetKcal: null, targetProtein: 0 }, 'calories');
    expect(k).toMatchObject({ detail: 'kcal eaten', progress: null });
    expect(tile({ ...base, targetProtein: 0 }, 'protein').progress).toBeNull();
    expect(tile({ ...base, week: { planned: 0, done: 0 } }, 'workouts').progress).toBeNull();
  });

  it('steps off: "Turn on steps" action, with an honest reason', () => {
    const asked = tile({ ...base, steps: { kind: 'off', reason: 'not_asked' } }, 'steps');
    expect(asked).toMatchObject({ value: 'Turn on steps', detail: 'Goal 8,000 a day', action: true, progress: null });
    const denied = tile({ ...base, steps: { kind: 'off', reason: 'denied' } }, 'steps');
    expect(denied).toMatchObject({ detail: 'Allow in phone settings', action: true });
    const none = tile({ ...base, steps: { kind: 'off', reason: 'unavailable' } }, 'steps');
    expect(none).toMatchObject({ detail: 'Not on this phone', action: false });
  });

  it('steps over goal caps the bar at 1', () => {
    expect(tile({ ...base, steps: { kind: 'on', steps: 12000 } }, 'steps').progress).toBe(1);
  });

  it('singulars and imperial units', () => {
    expect(tile({ ...base, streakWeeks: 1 }, 'streak').detail).toBe('week');
    expect(tile({ ...base, week: { planned: 1, done: 0 } }, 'workouts').detail).toBe('workout');
    expect(tile({ ...base, units: 'imperial' }, 'weight')).toMatchObject({ value: '179.0 lb', detail: '−1.8 lb · 30 days' });
  });

  it('no weigh-ins: the weight tile asks to log one', () => {
    const w = tile({ ...base, weight: { values: [], latestKg: null, deltaKg: null } }, 'weight');
    expect(w).toMatchObject({ value: 'Log weight', detail: 'No weigh-ins yet', action: true });
  });
});
