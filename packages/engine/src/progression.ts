/**
 * Training progression maths (sheet 28 "Training maths", RW-12, RW-25).
 * Double progression, RPE-based loads, deload rules, 1RM estimates, plate calculator.
 */
import type { Experience } from './schemas';

export type WeightUnit = 'kg' | 'lb';

// ---------------------------------------------------------------------------
// 1RM
// ---------------------------------------------------------------------------

/** Epley: w × (1 + reps/30). reps = 1 → w. */
export function epley1RM(weight: number, reps: number): number {
  assertSet(weight, reps);
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

/** Brzycki: w × 36 / (37 − reps). Valid for reps 1–36 (most accurate ≤ 10). */
export function brzycki1RM(weight: number, reps: number): number {
  assertSet(weight, reps);
  if (reps >= 37) throw new RangeError('Brzycki is undefined for reps ≥ 37');
  return (weight * 36) / (37 - reps);
}

function assertSet(weight: number, reps: number): void {
  if (!(weight >= 0) || !Number.isFinite(weight)) throw new RangeError('weight must be ≥ 0');
  if (!Number.isInteger(reps) || reps < 1) throw new RangeError('reps must be an integer ≥ 1');
}

/** Load for `reps` reps at a given 1RM (inverse Epley). */
export function loadForReps(oneRm: number, reps: number): number {
  if (reps <= 1) return oneRm;
  return oneRm / (1 + reps / 30);
}

/** % of 1RM table (RW-25): 50%…100% in 5% steps, rounded to `increment`. */
export function percentTable(oneRm: number, increment = 2.5): { pct: number; load: number; reps: number }[] {
  const out: { pct: number; load: number; reps: number }[] = [];
  for (let pct = 100; pct >= 50; pct -= 5) {
    const load = roundToIncrement((oneRm * pct) / 100, increment);
    // Epley inverse: reps = 30 × (1RM/w − 1)
    const reps = pct === 100 ? 1 : Math.max(1, Math.round(30 * (100 / pct - 1)));
    out.push({ pct, load, reps });
  }
  return out;
}

export function roundToIncrement(weight: number, increment: number, mode: 'nearest' | 'down' = 'nearest'): number {
  if (increment <= 0) throw new RangeError('increment must be > 0');
  const k = weight / increment;
  const n = mode === 'down' ? Math.floor(k + 1e-9) : Math.round(k);
  return Math.round(n * increment * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Double progression + RPE
// ---------------------------------------------------------------------------

export interface PerformedSet {
  weight: number;
  reps: number;
  rpe?: number;
}

export interface ProgressionInput {
  /** Working sets from the last session of this exercise. */
  lastSets: PerformedSet[];
  repRange: [number, number];
  /** Lower-body lifts jump +5 kg (+10 lb); upper-body +2.5 kg (+5 lb). */
  lowerBody: boolean;
  bodyweight?: boolean;
  unit?: WeightUnit;
  /** Above this average RPE a load increase is postponed (default 9.5). */
  maxRpeForIncrease?: number;
}

export type ProgressionAction = 'increase_load' | 'increase_reps' | 'hold' | 'calibrate';

export interface Prescription {
  action: ProgressionAction;
  weight: number | null;
  targetReps: number;
}

export const LOAD_INCREMENTS: Record<WeightUnit, { upper: number; lower: number }> = {
  kg: { upper: 2.5, lower: 5 },
  lb: { upper: 5, lower: 10 },
};

/**
 * Double progression: when every working set reaches the top of the rep range → add load
 * (+2.5/+5 kg, or +1 rep for bodyweight) and restart at the bottom of the range;
 * otherwise keep the load and aim for one more rep (capped at the top).
 */
export function doubleProgression(input: ProgressionInput): Prescription {
  const [lo, hi] = input.repRange;
  if (lo < 1 || hi < lo) throw new RangeError('invalid rep range');
  const sets = input.lastSets.filter((s) => s.reps > 0);
  if (sets.length === 0) return { action: 'calibrate', weight: null, targetReps: lo };
  const weight = Math.max(...sets.map((s) => s.weight));
  const minReps = Math.min(...sets.map((s) => s.reps));
  const rpes = sets.map((s) => s.rpe).filter((r): r is number => r !== undefined);
  const avgRpe = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : undefined;
  const maxRpe = input.maxRpeForIncrease ?? 9.5;
  if (input.bodyweight) {
    if (minReps >= hi) return { action: 'increase_reps', weight, targetReps: hi + 1 };
    return { action: 'increase_reps', weight, targetReps: Math.min(hi, minReps + 1) };
  }
  if (minReps >= hi && (avgRpe === undefined || avgRpe <= maxRpe)) {
    const inc = LOAD_INCREMENTS[input.unit ?? 'kg'][input.lowerBody ? 'lower' : 'upper'];
    return { action: 'increase_load', weight: weight + inc, targetReps: lo };
  }
  if (minReps >= hi) return { action: 'hold', weight, targetReps: hi };
  return { action: 'increase_reps', weight, targetReps: Math.max(lo, Math.min(hi, minReps + 1)) };
}

/**
 * RPE-based load: estimate 1RM from (weight, reps, RPE) using reps-in-reserve
 * (e1RM = Epley(weight, reps + (10 − RPE))), then solve for the target reps at the target RPE.
 */
export function rpeLoad(
  last: { weight: number; reps: number; rpe: number },
  target: { reps: number; rpe: number },
  increment = 2.5,
): number {
  if (last.rpe < 1 || last.rpe > 10 || target.rpe < 1 || target.rpe > 10) throw new RangeError('RPE must be 1–10');
  const e1rm = epley1RM(last.weight, last.reps + Math.round(10 - last.rpe));
  const load = loadForReps(e1rm, target.reps + Math.round(10 - target.rpe));
  return roundToIncrement(load, increment, 'down');
}

/** Starting load from a quiz benchmark (weight × reps) for target reps at RPE 8. */
export function startingLoad(benchmark: { weight: number; reps: number }, targetReps: number, increment = 2.5): number {
  const e1rm = epley1RM(benchmark.weight, benchmark.reps);
  return roundToIncrement(loadForReps(e1rm, targetReps + 2), increment, 'down');
}

// ---------------------------------------------------------------------------
// Stalls + deload
// ---------------------------------------------------------------------------

/** Best estimated 1RM per session (oldest → newest). Returns the number of trailing stalled sessions. */
export function stalledSessions(bestE1rmPerSession: number[]): number {
  let stalled = 0;
  let best = -Infinity;
  for (const v of bestE1rmPerSession) {
    if (v > best + 1e-9) {
      best = v;
      stalled = 0;
    } else {
      stalled += 1;
    }
  }
  return bestE1rmPerSession.length > 1 ? stalled : 0;
}

/** Block length in weeks (main lifts held, deload in the last week): 4–6 by experience. */
export const BLOCK_WEEKS: Record<Experience, number> = { beginner: 6, intermediate: 5, advanced: 4 };

export interface DeloadInput {
  /** 0-based week index inside the current block. */
  weekInBlock: number;
  blockWeeks: number;
  /** Max trailing stalled sessions across main lifts. */
  stalledSessions: number;
  /** Weeks since the last deload (Infinity if none). */
  weeksSinceDeload?: number;
}

export type DeloadReason = 'block_end' | 'stall' | null;

/** Deload every 4–6 weeks (the last week of the block) or after 2 stalled sessions. */
export function deloadDecision(input: DeloadInput): { deload: boolean; reason: DeloadReason } {
  if (input.weeksSinceDeload !== undefined && input.weeksSinceDeload < 2) return { deload: false, reason: null };
  if (input.weekInBlock >= input.blockWeeks - 1) return { deload: true, reason: 'block_end' };
  if (input.stalledSessions >= 2) return { deload: true, reason: 'stall' };
  return { deload: false, reason: null };
}

/** Deload: −40% volume (sets × 0.6, at least 1). */
export function deloadSets(sets: number): number {
  return Math.max(1, Math.round(sets * 0.6));
}

// ---------------------------------------------------------------------------
// Plate calculator
// ---------------------------------------------------------------------------

export const DEFAULT_PLATES: Record<WeightUnit, number[]> = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5],
};
export const DEFAULT_BAR: Record<WeightUnit, number> = { kg: 20, lb: 45 };

export interface PlateResult {
  /** Plates for ONE side, heaviest first. */
  perSide: number[];
  /** Total achievable weight (bar + 2 × plates) ≤ target. */
  achieved: number;
  /** target − achieved (≥ 0). */
  remainder: number;
}

/**
 * Plates per side for a target total. Greedy on integer milli-units (exact for standard
 * plate sets). `pairs` optionally limits how many pairs of each plate exist.
 */
export function platesPerSide(
  target: number,
  opts: { unit?: WeightUnit; bar?: number; plates?: number[]; pairs?: Record<string, number> } = {},
): PlateResult {
  const unit = opts.unit ?? 'kg';
  const bar = opts.bar ?? DEFAULT_BAR[unit];
  const plates = [...(opts.plates ?? DEFAULT_PLATES[unit])].sort((a, b) => b - a);
  const toMilli = (x: number) => Math.round(x * 1000);
  if (target <= bar) return { perSide: [], achieved: bar, remainder: Math.max(0, target - bar) };
  let remaining = Math.floor((toMilli(target) - toMilli(bar)) / 2);
  const perSide: number[] = [];
  for (const p of plates) {
    const pm = toMilli(p);
    let available = opts.pairs?.[String(p)] ?? Infinity;
    while (remaining >= pm && available > 0) {
      perSide.push(p);
      remaining -= pm;
      available -= 1;
    }
  }
  const achieved = (toMilli(bar) + 2 * perSide.reduce((a, p) => a + toMilli(p), 0)) / 1000;
  return { perSide, achieved, remainder: Math.round((target - achieved) * 1000) / 1000 };
}
