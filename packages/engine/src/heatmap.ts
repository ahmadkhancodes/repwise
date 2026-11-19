/**
 * Muscle recovery / fatigue heatmap from recent sets (RW-50, sheet 28 step 2).
 * Each hard set adds fatigue (1.0 primary, 0.5 secondary) that decays exponentially with a
 * per-muscle half-life. Pure function of (sets, catalogue, now).
 */
import { MUSCLES, type Exercise, type Muscle, type SetLog } from './schemas';

const HOUR = 3_600_000;

/** Half-life in hours: big muscles recover more slowly. */
export const MUSCLE_HALF_LIFE_H: Record<Muscle, number> = {
  chest: 36,
  lats: 36,
  upper_back: 30,
  traps: 24,
  front_delts: 24,
  side_delts: 24,
  rear_delts: 24,
  biceps: 24,
  triceps: 24,
  forearms: 18,
  abs: 18,
  obliques: 18,
  lower_back: 40,
  glutes: 40,
  quads: 40,
  hamstrings: 40,
  adductors: 30,
  abductors: 24,
  calves: 18,
  hip_flexors: 24,
};

/** Fatigue units that map to a fully "red" muscle (≈ 8 fresh hard sets). */
export const FATIGUE_SATURATION = 8;

export interface MuscleState {
  /** 0 (fresh) … 1 (saturated). */
  fatigue: number;
  /** 1 − fatigue. */
  recovery: number;
  /** Hard-set credit in the last 7 days (no decay). */
  setsLast7d: number;
}

export type Heatmap = Record<Muscle, MuscleState>;

export function muscleHeatmap(sets: SetLog[], exById: ReadonlyMap<string, Exercise>, now: number, lookbackDays = 7): Heatmap {
  const raw = Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Record<Muscle, number>;
  const week = Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Record<Muscle, number>;
  const from = now - lookbackDays * 24 * HOUR;
  for (const s of sets) {
    if (s.type === 'warmup' || s.type === 'cardio') continue;
    if (s.doneAt > now || s.doneAt < from) continue;
    const ex = exById.get(s.exerciseId);
    if (!ex) continue;
    const ageH = (now - s.doneAt) / HOUR;
    const add = (m: Muscle, credit: number) => {
      raw[m] += credit * Math.pow(2, -ageH / MUSCLE_HALF_LIFE_H[m]);
      week[m] += credit;
    };
    ex.primaryMuscles.forEach((m) => add(m, 1));
    ex.secondaryMuscles.forEach((m) => add(m, 0.5));
  }
  const out = {} as Heatmap;
  for (const m of MUSCLES) {
    const fatigue = Math.min(1, raw[m] / FATIGUE_SATURATION);
    out[m] = { fatigue: round3(fatigue), recovery: round3(1 - fatigue), setsLast7d: week[m] };
  }
  return out;
}

/** Mean recovery of a set of muscles (1 = fully recovered). */
export function meanRecovery(heatmap: Heatmap, muscles: readonly Muscle[]): number {
  if (muscles.length === 0) return 1;
  return muscles.reduce((a, m) => a + heatmap[m].recovery, 0) / muscles.length;
}

/** Ratio of the most-trained to the least-trained of two muscle sets this week (card C1). */
export function imbalanceRatio(heatmap: Heatmap, a: readonly Muscle[], b: readonly Muscle[]): number {
  const sa = a.reduce((x, m) => x + heatmap[m].setsLast7d, 0);
  const sb = b.reduce((x, m) => x + heatmap[m].setsLast7d, 0);
  const lo = Math.min(sa, sb);
  const hi = Math.max(sa, sb);
  if (hi === 0) return 1;
  return lo === 0 ? Infinity : hi / lo;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;
