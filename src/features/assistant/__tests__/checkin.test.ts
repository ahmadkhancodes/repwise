
import {
  appliesFrom,
  computeCheckin,
  deltaLabel,
  displayWeight,
  floorFor,
  kcalChangeBucket,
  share,
  summaryCopy,
  toKg,
  volumeStep,
  weeklyAdherence,
  weighInsFor,
} from '../logic/checkin';
import { pointsAttr, sparkPoints } from '../logic/spark';

const SUN = '2026-11-22';

/** Daily weigh-ins: days 13..7 ago at `prior` kg, days 6..0 ago at `recent` kg. */
function weights(prior: number, recent: number) {
  const out: { date: string; kg: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.UTC(2026, 10, 22 - i)).toISOString().slice(0, 10);
    out.push({ date: d, kg: i >= 7 ? prior : recent });
  }
  return out;
}

describe('adherence', () => {
  it('counts the 7 days ending today; skipped items are not planned', () => {
    const a = weeklyAdherence(
      SUN,
      [
        { date: '2026-11-16', status: 'done' },
        { date: '2026-11-18', status: 'planned' },
        { date: '2026-11-20', status: 'skipped' },
        { date: '2026-11-15', status: 'done' }, // 7 days ago: outside
        { date: null, status: 'done' },
      ],
      [
        { date: '2026-11-21', status: 'eaten' },
        { date: '2026-11-21', status: 'planned' },
        { date: '2026-11-22', status: 'skipped' },
      ],
    );
    expect(a).toEqual({ workoutsDone: 1, workoutsPlanned: 2, mealsEaten: 1, mealsPlanned: 2 });
    expect(share(1, 2)).toBe(0.5);
    expect(share(3, 2)).toBe(1);
    expect(share(0, 0)).toBeNull();
  });
});

describe('volume step', () => {
  it('deload on request or low energy with poor sleep; hold on low energy or low adherence', () => {
    expect(volumeStep({ workoutShare: 1, energy: 'great', sleep: 'good', deloadRequested: true })).toBe('deload');
    expect(volumeStep({ workoutShare: 1, energy: 'low', sleep: 'poor', deloadRequested: false })).toBe('deload');
    expect(volumeStep({ workoutShare: 1, energy: 'low', sleep: 'good', deloadRequested: false })).toBe('hold');
    expect(volumeStep({ workoutShare: 0.5, energy: 'great', sleep: 'good', deloadRequested: false })).toBe('hold');
    expect(volumeStep({ workoutShare: 0.75, energy: 'ok', sleep: 'ok', deloadRequested: false })).toBe('progress');
    expect(volumeStep({ workoutShare: null, energy: 'ok', sleep: 'ok', deloadRequested: false })).toBe('progress');
  });
});

describe('inputs', () => {
  it('floor from the engine, with safe defaults', () => {
    // BMR (male, 80 kg, 180 cm, 30 y) = 1780 → ×1.1 = 1958 → 1960 (engine rounds up to 10).
    expect(floorFor({ sex: 'male', weightKg: 80, heightCm: 180, birthYear: 1996 }, SUN)).toBe(1960);
    expect(floorFor({ sex: 'female', weightKg: null, heightCm: 165, birthYear: 1990 }, SUN)).toBe(1200);
    expect(floorFor({ sex: 'male', weightKg: null, heightCm: null, birthYear: null }, SUN)).toBe(1500);
    expect(floorFor({ sex: null, weightKg: 70, heightCm: 170, birthYear: 1990 }, SUN)).toBe(1200);
  });

  it('weigh-ins: last 14 days, today replaces a stored entry', () => {
    const w = weighInsFor(
      SUN,
      [
        { date: '2026-11-01', weightKg: 90 },
        { date: '2026-11-20', weightKg: 80 },
        { date: SUN, weightKg: 79.5 },
        { date: '2026-11-21', weightKg: null },
      ],
      79.2,
    );
    expect(w).toEqual([
      { date: '2026-11-20', kg: 80 },
      { date: SUN, kg: 79.2 },
    ]);
  });

  it('units: lb shown for imperial, stored as kg (engine conversion)', () => {
    expect(displayWeight(80, false)).toBe(80);
    expect(displayWeight(80, true)).toBe(176.4);
    expect(toKg(176.4, true)).toBe(80.01);
    expect(toKg(80, false)).toBe(80);
  });

  it('new targets apply from Monday', () => {
    expect(appliesFrom(SUN)).toBe('2026-11-23');
    expect(appliesFrom('2026-11-23')).toBe('2026-11-23');
    expect(appliesFrom('2026-11-19')).toBe('2026-11-23');
  });
});

describe('computeCheckin (engine weeklyAdjustment)', () => {
  const base = {
    onDate: SUN,
    currentKcal: 2300,
    floor: 1600,
    adherence: { workoutsDone: 4, workoutsPlanned: 4, mealsEaten: 20, mealsPlanned: 21 },
    energy: 'great' as const,
    sleep: 'good' as const,
    deloadRequested: false,
  };

  it('fat loss with a flat trend lowers calories by 100–200', () => {
    const r = computeCheckin({ ...base, goal: 'fat_loss', weighIns: weights(80, 80) });
    expect(r.adjustment.deltaKcal).toBeLessThanOrEqual(-100);
    expect(r.adjustment.deltaKcal).toBeGreaterThanOrEqual(-200);
    expect(r.after.kcal).toBe(2300 + r.adjustment.deltaKcal);
    expect(r.before.kcal).toBe(2300);
    expect(r.volume).toBe('progress');
    expect(r.trend.length).toBe(14);
    expect(r.summary).toMatch(/held steady.*ease down/);
  });

  it('on track keeps calories', () => {
    const r = computeCheckin({ ...base, goal: 'fat_loss', weighIns: weights(80, 79.6) });
    expect(r.adjustment.reason).toBe('on_track');
    expect(r.adjustment.deltaKcal).toBe(0);
    expect(r.summary).toMatch(/fell 0.4 kg, right on track/);
  });

  it('too few weigh-ins → no change, unknown goal → maintain', () => {
    const r = computeCheckin({ ...base, goal: 'nonsense', weighIns: [{ date: SUN, kg: 80 }] });
    expect(r.goal).toBe('maintain');
    expect(r.adjustment.reason).toBe('insufficient_data');
    expect(r.after.kcal).toBe(2300);
    expect(r.summary).toMatch(/Not enough weigh-ins/);
  });

  it('muscle gain gaining too slowly raises calories', () => {
    const r = computeCheckin({ ...base, goal: 'muscle_gain', weighIns: weights(70, 69.6) });
    expect(r.adjustment.deltaKcal).toBeGreaterThan(0);
    expect(r.summary).toMatch(/go up/);
  });

  it('summary mentions adherence and low energy', () => {
    const adj = { deltaKcal: 0, newKcal: 2000, reason: 'floor' as const, trendKgPerWeek: 0.2, expectedKgPerWeek: -0.4 };
    const s = summaryCopy(adj, { workoutsDone: 2, workoutsPlanned: 4, mealsEaten: 0, mealsPlanned: 0 }, 'low');
    expect(s).toMatch(/rose 0.2 kg, calories are already at your safe minimum/);
    expect(s).toMatch(/2 of 4 workouts done/);
    expect(s).toMatch(/Energy was low/);
  });

  it('analytics bucket and labels never carry raw numbers', () => {
    expect(kcalChangeBucket(-200)).toBe('down_150_200');
    expect(kcalChangeBucket(-100)).toBe('down_50_100');
    expect(kcalChangeBucket(0)).toBe('none');
    expect(kcalChangeBucket(100)).toBe('up_50_100');
    expect(kcalChangeBucket(150)).toBe('up_150_200');
    expect(deltaLabel(-150)).toBe('−150 kcal');
    expect(deltaLabel(100)).toBe('+100 kcal');
    expect(deltaLabel(0)).toBe('No change');
  });
});

describe('sparkline geometry', () => {
  it('fills the box, highest value at the top', () => {
    const pts = sparkPoints([80, 79, 78], 100, 40, 2);
    expect(pts).toEqual([
      { x: 2, y: 2 },
      { x: 50, y: 20 },
      { x: 98, y: 38 },
    ]);
    expect(pointsAttr(pts)).toBe('2,2 50,20 98,38');
    expect(sparkPoints([5, 5], 10, 10)).toEqual([
      { x: 0, y: 5 },
      { x: 10, y: 5 },
    ]);
    expect(sparkPoints([5], 10, 10)).toEqual([{ x: 5, y: 5 }]);
    expect(sparkPoints([], 10, 10)).toEqual([]);
  });
});
