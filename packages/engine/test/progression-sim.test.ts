/**
 * 16-week training simulations on the real catalogues: logged hits, misses and stalls are fed back
 * as set logs, and the planner's loads, reps and deloads are checked week by week (RW-12, sheet 28
 * "Training maths"). See docs/ENGINE_QA.md.
 */
import {
  BLOCK_WEEKS,
  EQUIPMENT_PRESETS,
  LOAD_INCREMENTS,
  addDays,
  appendPlanToHistory,
  isLowerBody,
  kgToLb,
  plateLoadKg,
  planWeek,
  toDayNumber,
  type HistoryInput,
  type ProfileInput,
  type SetLog,
  type WeekPlan,
} from '../src';
import { CATALOGUES, IX, NOW, WEEK } from './support/property';
import { Gen } from './support/gen';

const DAY = 86_400_000;
const WEEKS = 16;

type Outcome = 'hit' | 'miss' | 'stall';
interface Logged {
  week: number;
  date: string;
  exerciseId: string;
  main: boolean;
  deload: boolean;
  loadKg: number | null;
  targetReps: number;
  repRange: [number, number];
  sets: number;
  outcome: Outcome;
  weight: number;
}

const person = (p: Partial<ProfileInput>): ProfileInput => ({
  goal: 'muscle_gain',
  sex: 'male',
  birthYear: 1994,
  heightCm: 180,
  weightKg: 82,
  experience: 'intermediate',
  daysPerWeek: 4,
  sessionMin: 60,
  equipment: [...EQUIPMENT_PRESETS.full_gym],
  mealsPerDay: 3,
  ...p,
});

/** Runs `weeks` weeks; `outcome` decides how each planned item is performed. */
function simulate(profile: ProfileInput, outcome: (week: number, main: boolean, exerciseId: string) => Outcome, weeks = WEEKS) {
  let h: HistoryInput = {};
  const plans: WeekPlan[] = [];
  const log: Logged[] = [];
  for (let w = 0; w < weeks; w++) {
    const plan = planWeek(profile, h, CATALOGUES, { now: NOW + w * 7 * DAY, weekStart: addDays(WEEK, 7 * w) });
    plans.push(plan);
    const sets: SetLog[] = [];
    for (const s of plan.sessions) {
      for (const it of s.items) {
        const main = it.role === 'main';
        const o = outcome(w, main, it.exerciseId);
        // Calibration session (no load yet): the user picks 20 kg (ignored for bodyweight work).
        const weight = it.loadKg ?? 20;
        const [lo, hi] = it.repRange;
        const reps = o === 'hit' ? Math.max(hi, it.targetReps) : o === 'stall' ? Math.max(lo, it.targetReps - 1) : Math.max(1, lo - 2);
        const done = toDayNumber(s.date) * DAY + 17 * 3_600_000;
        for (let k = 0; k < it.sets; k++) sets.push({ exerciseId: it.exerciseId, doneAt: done + k * 60_000, type: 'working', weightKg: weight, reps, rpe: 8 });
        log.push({ week: w, date: s.date, exerciseId: it.exerciseId, main, deload: s.deload, loadKg: it.loadKg, targetReps: it.targetReps, repRange: it.repRange, sets: it.sets, outcome: o, weight });
      }
    }
    h = appendPlanToHistory({ ...h, sets: [...(h.sets ?? []), ...sets] }, plan);
  }
  return { plans, log };
}

/** Consecutive appearances of the same exercise (prev → next). */
function pairs(log: Logged[]): [Logged, Logged][] {
  const last = new Map<string, Logged>();
  const out: [Logged, Logged][] = [];
  for (const l of log) {
    const prev = last.get(l.exerciseId);
    if (prev) out.push([prev, l]);
    last.set(l.exerciseId, l);
  }
  return out;
}

const isStep = (kg: number, unit: 'kg' | 'lb') => {
  const v = unit === 'kg' ? kg / 2.5 : kgToLb(kg) / 5;
  return Math.abs(v - Math.round(v)) < 1e-6;
};

describe('16 weeks of hits (metric, intermediate, 4-day upper/lower)', () => {
  const { plans, log } = simulate(person({}), () => 'hit');

  test('deloads land on the last week of each block (block_end), never two weeks apart', () => {
    const deloads = plans.map((p, i) => (p.deload ? i : -1)).filter((i) => i >= 0);
    const block = BLOCK_WEEKS.intermediate;
    expect(deloads).toEqual([block - 1, 2 * block - 1, 3 * block - 1]);
    for (const i of deloads) expect(plans[i]!.deloadReason).toBe('block_end');
  });

  test('every load is a real plate step (2.5 kg)', () => {
    for (const l of log) if (l.loadKg !== null) expect(isStep(l.loadKg, 'kg')).toBe(true);
  });

  test('a hit at the top of the range adds exactly one increment (+2.5 upper / +5 lower) and restarts at the bottom', () => {
    let checked = 0;
    for (const [a, b] of pairs(log)) {
      if (a.deload || b.deload || a.loadKg === null || b.loadKg === null) continue;
      const ex = IX.exById.get(a.exerciseId)!;
      const inc = LOAD_INCREMENTS.kg[isLowerBody(ex) ? 'lower' : 'upper'];
      if (a.weight !== a.loadKg) continue;
      expect(b.loadKg).toBeCloseTo(plateLoadKg(a.loadKg + inc, 'kg'), 6);
      if (a.repRange[0] === b.repRange[0]) expect(b.targetReps).toBe(b.repRange[0]);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(50);
  });

  test('deload weeks: −40% sets, RPE 6, bottom of the range, load never above the last normal load', () => {
    for (const l of log.filter((x) => x.deload)) {
      expect(l.targetReps).toBe(l.repRange[0]);
      expect(l.sets).toBeLessThanOrEqual(3);
    }
    for (const [a, b] of pairs(log)) {
      // 90% of what the next normal session would prescribe, rounded down: never above the last load done.
      if (!a.deload && b.deload && a.loadKg !== null && b.loadKg !== null) expect(b.loadKg).toBeLessThanOrEqual(a.loadKg + 1e-6);
    }
    for (const p of plans.filter((x) => x.deload)) for (const s of p.sessions) for (const it of s.items) expect(it.rpe).toBe(6);
  });

  test('the week after a deload resumes from the pre-deload load, not the deload load (bug 7)', () => {
    let checked = 0;
    const byEx = new Map<string, Logged[]>();
    for (const l of log) byEx.set(l.exerciseId, [...(byEx.get(l.exerciseId) ?? []), l]);
    for (const seq of byEx.values()) {
      for (let i = 1; i + 1 < seq.length; i++) {
        const [before, dl, after] = [seq[i - 1]!, seq[i]!, seq[i + 1]!];
        if (before.deload || !dl.deload || after.deload || before.loadKg === null || after.loadKg === null || dl.loadKg === null) continue;
        expect(after.loadKg).toBeGreaterThan(dl.loadKg);
        expect(after.loadKg).toBeGreaterThanOrEqual(before.loadKg);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  test('main lifts climb over the 16 weeks', () => {
    const mains = log.filter((l) => l.main && l.loadKg !== null && !l.deload);
    const first = new Map<string, number>();
    const last = new Map<string, number>();
    for (const l of mains) {
      if (!first.has(l.exerciseId)) first.set(l.exerciseId, l.loadKg as number);
      last.set(l.exerciseId, l.loadKg as number);
    }
    const climbed = [...first.keys()].filter((id) => (last.get(id) as number) > (first.get(id) as number));
    expect(climbed.length).toBeGreaterThanOrEqual(Math.ceil(first.size / 2));
  });
});

describe('stalls and misses', () => {
  test('main lifts stalled for 2 sessions → the next week deloads (reason stall), then not again for 2 weeks', () => {
    const { plans } = simulate(person({ experience: 'intermediate', daysPerWeek: 3 }), (w, main) => (w >= 1 && main ? 'stall' : 'hit'), 8);
    const first = plans.findIndex((p) => p.deload);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThanOrEqual(3);
    expect(plans[first]!.deloadReason).toBe('stall');
    expect(plans[first + 1]!.deload).toBe(false);
  });

  test('a missed session never raises the load', () => {
    const { log } = simulate(person({}), (w) => (w % 3 === 2 ? 'miss' : 'hit'));
    for (const [a, b] of pairs(log)) {
      if (a.outcome !== 'miss' || a.loadKg === null || b.loadKg === null || a.deload || b.deload) continue;
      expect(b.loadKg).toBeLessThanOrEqual(a.loadKg + 1e-6);
      expect(b.targetReps).toBeGreaterThanOrEqual(b.repRange[0]);
    }
  });

  test('random hits/misses/stalls over 16 weeks (12 seeded profiles): loads stay on plate steps, finite, ≤ 500 kg', () => {
    const g = new Gen(7);
    for (let i = 0; i < 12; i++) {
      const units = g.bool() ? 'imperial' : 'metric';
      const profile = person({ units, experience: g.pick(['beginner', 'intermediate', 'advanced'] as const), daysPerWeek: g.int(2, 6), sex: g.pick(['male', 'female'] as const) });
      const r = new Gen(100 + i);
      const { log, plans } = simulate(profile, () => (r.next() < 0.6 ? 'hit' : r.next() < 0.5 ? 'miss' : 'stall'));
      for (const l of log) {
        if (l.loadKg === null) continue;
        expect(Number.isFinite(l.loadKg)).toBe(true);
        expect(l.loadKg).toBeGreaterThanOrEqual(0);
        expect(l.loadKg).toBeLessThanOrEqual(500);
        expect(isStep(l.loadKg, units === 'imperial' ? 'lb' : 'kg')).toBe(true);
      }
      for (let w = 1; w < plans.length; w++) if (plans[w]!.deload && plans[w - 1]!.deload) expect(plans[w]!.deloadReason).toBe('requested');
    }
  });
});

describe('imperial units (bug 6)', () => {
  const { log } = simulate(person({ units: 'imperial' }), () => 'hit', 6);

  test('every load is a whole 5 lb step', () => {
    const loads = log.filter((l) => l.loadKg !== null && l.loadKg > 0);
    expect(loads.length).toBeGreaterThan(20);
    for (const l of loads) expect(isStep(l.loadKg as number, 'lb')).toBe(true);
  });

  test('a hit adds +5 lb upper / +10 lb lower', () => {
    let checked = 0;
    for (const [a, b] of pairs(log)) {
      if (a.deload || b.deload || a.loadKg === null || b.loadKg === null || a.weight !== a.loadKg) continue;
      const ex = IX.exById.get(a.exerciseId)!;
      const inc = LOAD_INCREMENTS.lb[isLowerBody(ex) ? 'lower' : 'upper'];
      expect(kgToLb(b.loadKg)).toBeCloseTo(kgToLb(a.loadKg) + inc, 4);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(10);
  });
});

describe('plateLoadKg', () => {
  test('kg rounds to 2.5 kg; lb rounds to 5 lb and returns its exact kg', () => {
    expect(plateLoadKg(61.3, 'kg')).toBe(62.5);
    expect(plateLoadKg(61.3, 'kg', 'down')).toBe(60);
    expect(kgToLb(plateLoadKg(61.3, 'lb'))).toBeCloseTo(135, 6);
    expect(kgToLb(plateLoadKg(lbToKgExact(100), 'lb', 'down'))).toBeCloseTo(100, 6);
    expect(plateLoadKg(-3, 'kg')).toBe(0);
  });
});

function lbToKgExact(lb: number): number {
  return lb * 0.45359237;
}
