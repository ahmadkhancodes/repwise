/**
 * Home dashboard stats (Today, owner 22 Nov): pure maths for the glanceable tiles under the
 * workout hero. Everything here is deterministic and unit tested; components only format.
 */
import type { UnitSystem } from '@/features/progress/logic/units';
import { displayWeight } from '@/features/progress/logic/units';

export const DEFAULT_STEPS_GOAL = 8000;
export const STEPS_GOAL_MIN = 1000;
export const STEPS_GOAL_MAX = 50000;
export const STEPS_GOAL_STEP = 500;

/** Clamp to [min, max] and snap to the 500-step grid; junk → the default. */
export function clampStepsGoal(goal: number): number {
  if (!Number.isFinite(goal) || goal <= 0) return DEFAULT_STEPS_GOAL;
  const snapped = Math.round(goal / STEPS_GOAL_STEP) * STEPS_GOAL_STEP;
  return Math.min(STEPS_GOAL_MAX, Math.max(STEPS_GOAL_MIN, snapped));
}

/** value / target in [0, 1]; a missing or zero target is 0 (never NaN or Infinity). */
export function ratio(value: number, target: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(target) || target <= 0 || value <= 0) return 0;
  return Math.min(1, value / target);
}

/** A set as the dashboard reads it (one row per logged set). */
export type VolumeSet = {
  sessionDate: string | null;
  type: string | null;
  weightKg: number | null;
  reps: number | null;
  doneAt: number | null;
};

/**
 * Weekly volume (tonnage) in kg: weight × reps of every finished work set whose session is dated
 * inside [from, to]. Warm-ups and cardio do not count (same rule as Progress).
 */
export function weekVolumeKg(rows: readonly VolumeSet[], from: string, to: string): number {
  let sum = 0;
  for (const r of rows) {
    if (r.doneAt == null || !r.sessionDate) continue;
    if (r.sessionDate < from || r.sessionDate > to) continue;
    if (r.type === 'warmup' || r.type === 'cardio') continue;
    const w = r.weightKg ?? 0;
    const reps = r.reps ?? 0;
    if (w > 0 && reps > 0) sum += w * reps;
  }
  return Math.round(sum);
}

export type WeightTrend = {
  /** Daily weights (kg, oldest first) inside the window; feeds the sparkline. */
  values: number[];
  latestKg: number | null;
  /** Latest − first in the window (kg); null with fewer than two weigh-ins. */
  deltaKg: number | null;
};

/** Weigh-ins of the last `days` days up to `today`, one per date (the last row of a date wins). */
export function weightTrend(
  rows: readonly { date: string; weightKg: number | null }[],
  today: string,
  from: string,
): WeightTrend {
  const byDate = new Map<string, number>();
  for (const r of rows) {
    if (r.weightKg == null || !(r.weightKg > 0)) continue;
    if (r.date < from || r.date > today) continue;
    byDate.set(r.date, r.weightKg);
  }
  const values = [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, kg]) => kg);
  const latestKg = values.length ? values[values.length - 1]! : null;
  const deltaKg = values.length >= 2 ? Math.round((latestKg! - values[0]!) * 10) / 10 : null;
  return { values, latestKg, deltaKg };
}

/** "12,450" — integer with grouping, tabular in the UI. */
export function fmtInt(n: number): string {
  return Math.round(Math.max(0, n)).toLocaleString('en-US');
}

/** Compact load: under 10,000 → "8,420 kg"; above → "12.4 t" ("27.3k lb" imperial). */
export function formatVolume(kg: number, units: UnitSystem): string {
  const v = displayWeight(Math.max(0, kg), units);
  if (units === 'imperial') return v >= 10000 ? `${(v / 1000).toFixed(1)}k lb` : `${fmtInt(v)} lb`;
  return v >= 10000 ? `${(v / 1000).toFixed(1)} t` : `${fmtInt(v)} kg`;
}

/** Signed weight change: "−0.8 kg", "+1.2 lb", "No change". */
export function formatWeightDelta(deltaKg: number, units: UnitSystem): string {
  const v = Math.round(displayWeight(Math.abs(deltaKg), units) * 10) / 10;
  if (v === 0) return 'No change';
  const unit = units === 'imperial' ? 'lb' : 'kg';
  return `${deltaKg < 0 ? '−' : '+'}${v.toFixed(1)} ${unit}`;
}

export type StepsState =
  | { kind: 'on'; steps: number }
  /** Not asked yet, denied, or no step counter on this phone: the tile offers "Turn on steps". */
  | { kind: 'off'; reason: 'not_asked' | 'denied' | 'unavailable' };

export type StatsInput = {
  eatenKcal: number;
  targetKcal: number | null;
  eatenProtein: number;
  targetProtein: number | null;
  steps: StepsState;
  stepsGoal: number;
  week: { planned: number; done: number };
  streakWeeks: number;
  volumeKg: number;
  weight: WeightTrend;
  units: UnitSystem;
};

export type StatTile = {
  id: 'calories' | 'protein' | 'steps' | 'workouts' | 'streak' | 'volume' | 'weight';
  label: string;
  /** Big tabular number ("1,240"); a short call to action when the tile is off. */
  value: string;
  /** Secondary line ("of 2,300 kcal"). */
  detail: string;
  /** 0..1 for a ring or bar, null when the tile has no target. */
  progress: number | null;
  /** The whole tile spoken as one sentence. */
  a11y: string;
  /** The tile is an action ("Turn on steps"), not a number. */
  action?: boolean;
};

/** Every dashboard tile, in display order (calories first: it is the ring). */
export function buildStats(i: StatsInput): StatTile[] {
  const unit = i.units === 'imperial' ? 'lb' : 'kg';
  const tiles: StatTile[] = [];

  const kcalTarget = i.targetKcal ?? 0;
  tiles.push({
    id: 'calories',
    label: 'Calories',
    value: fmtInt(i.eatenKcal),
    detail: kcalTarget > 0 ? `of ${fmtInt(kcalTarget)} kcal` : 'kcal eaten',
    progress: kcalTarget > 0 ? ratio(i.eatenKcal, kcalTarget) : null,
    a11y:
      kcalTarget > 0
        ? `Calories: ${fmtInt(i.eatenKcal)} of ${fmtInt(kcalTarget)} kcal eaten`
        : `Calories: ${fmtInt(i.eatenKcal)} kcal eaten`,
  });

  const pTarget = i.targetProtein ?? 0;
  tiles.push({
    id: 'protein',
    label: 'Protein',
    value: `${fmtInt(i.eatenProtein)} g`,
    detail: pTarget > 0 ? `of ${fmtInt(pTarget)} g` : 'eaten today',
    progress: pTarget > 0 ? ratio(i.eatenProtein, pTarget) : null,
    a11y:
      pTarget > 0
        ? `Protein: ${fmtInt(i.eatenProtein)} of ${fmtInt(pTarget)} grams`
        : `Protein: ${fmtInt(i.eatenProtein)} grams`,
  });

  if (i.steps.kind === 'on') {
    tiles.push({
      id: 'steps',
      label: 'Steps',
      value: fmtInt(i.steps.steps),
      detail: `of ${fmtInt(i.stepsGoal)}`,
      progress: ratio(i.steps.steps, i.stepsGoal),
      a11y: `Steps: ${fmtInt(i.steps.steps)} of ${fmtInt(i.stepsGoal)}`,
    });
  } else {
    const detail =
      i.steps.reason === 'unavailable'
        ? 'Not on this phone'
        : i.steps.reason === 'denied'
          ? 'Allow in phone settings'
          : `Goal ${fmtInt(i.stepsGoal)} a day`;
    tiles.push({
      id: 'steps',
      label: 'Steps',
      value: 'Turn on steps',
      detail,
      progress: null,
      a11y: i.steps.reason === 'unavailable' ? 'Steps: not available on this phone' : `Turn on steps. ${detail}`,
      action: i.steps.reason !== 'unavailable',
    });
  }

  tiles.push({
    id: 'workouts',
    label: 'This week',
    value: `${i.week.done}/${i.week.planned}`,
    detail: i.week.planned === 1 ? 'workout' : 'workouts',
    progress: i.week.planned > 0 ? ratio(i.week.done, i.week.planned) : null,
    a11y: `Workouts this week: ${i.week.done} of ${i.week.planned}`,
  });

  tiles.push({
    id: 'streak',
    label: 'Streak',
    value: String(Math.max(0, i.streakWeeks)),
    detail: i.streakWeeks === 1 ? 'week' : 'weeks',
    progress: null,
    a11y: `Streak: ${Math.max(0, i.streakWeeks)} ${i.streakWeeks === 1 ? 'week' : 'weeks'} in a row`,
  });

  const vol = formatVolume(i.volumeKg, i.units);
  tiles.push({
    id: 'volume',
    label: 'Volume',
    value: vol,
    detail: 'lifted this week',
    progress: null,
    a11y: `Volume lifted this week: ${vol}`,
  });

  const w = i.weight;
  const latest = w.latestKg != null ? `${(Math.round(displayWeight(w.latestKg, i.units) * 10) / 10).toFixed(1)} ${unit}` : null;
  tiles.push({
    id: 'weight',
    label: 'Weight',
    value: latest ?? 'Log weight',
    detail: w.deltaKg != null ? `${formatWeightDelta(w.deltaKg, i.units)} · 30 days` : latest ? 'Last 30 days' : 'No weigh-ins yet',
    progress: null,
    a11y: latest
      ? `Weight: ${latest}${w.deltaKg != null ? `, ${formatWeightDelta(w.deltaKg, i.units)} in 30 days` : ''}`
      : 'Weight: no weigh-ins yet. Log weight',
    action: latest == null,
  });

  return tiles;
}
