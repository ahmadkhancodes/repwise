import type { SetType } from '@/db/schema';

/** The fields of a set row the logic needs (a WorkoutSet satisfies it). */
export type SetLike = {
  type: SetType;
  weightKg: number | null;
  reps: number | null;
  rpe?: number | null;
  durationS?: number | null;
  distanceM?: number | null;
  doneAt: number | null;
};

export const SET_TYPES: { value: Exclude<SetType, 'cardio'>; label: string; short: string }[] = [
  { value: 'warmup', label: 'Warm-up', short: 'W' },
  { value: 'working', label: 'Working', short: '' },
  { value: 'drop', label: 'Drop set', short: 'D' },
  { value: 'failure', label: 'To failure', short: 'F' },
];

/** RPE choices offered on a set (sheet RW-21): 6–10 in half steps. */
export const RPE_OPTIONS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const;

export const DEFAULT_REP_RANGE: [number, number] = [8, 12];

/** session_exercises.target_reps ("8-12", "8–12", "10", null) → [low, high]. */
export function parseRepRange(target: string | null | undefined): [number, number] {
  if (!target) return DEFAULT_REP_RANGE;
  const nums = (target.match(/\d+/g) ?? []).map(Number).filter((n) => n > 0);
  const [a, b] = nums;
  if (a === undefined) return DEFAULT_REP_RANGE;
  if (b === undefined) return [a, a];
  return a <= b ? [a, b] : [b, a];
}

/** Labels for the set column: warm-ups "W", drops "D", failure "F", working sets 1, 2, 3… */
export function setLabels(sets: Pick<SetLike, 'type'>[]): string[] {
  let n = 0;
  return sets.map((s) => {
    const meta = SET_TYPES.find((t) => t.value === s.type);
    if (meta && meta.short) return meta.short;
    n += 1;
    return String(n);
  });
}

/** Spoken name of a set for screen readers: "Set 2", "Warm-up set". */
export function spokenSetName(type: SetType, label: string): string {
  if (type === 'warmup') return 'Warm-up set';
  if (type === 'drop') return 'Drop set';
  if (type === 'failure') return 'Set to failure';
  return `Set ${label}`;
}

export function isDone(s: Pick<SetLike, 'doneAt'>): boolean {
  return s.doneAt != null;
}

/** Sets that count for volume, PRs and progression (warm-ups and cardio never do). */
export function countsAsWork(s: Pick<SetLike, 'type'>): boolean {
  return s.type === 'working' || s.type === 'drop' || s.type === 'failure';
}

/** Total lifted (kg): Σ weight × reps over done work sets. Bodyweight sets add 0. */
export function volumeKg(sets: SetLike[]): number {
  return sets.reduce(
    (acc, s) => acc + (isDone(s) && countsAsWork(s) ? (s.weightKg ?? 0) * (s.reps ?? 0) : 0),
    0,
  );
}

export type Prefill = { type: SetType; weightKg: number | null; reps: number | null };

/**
 * Pre-filled set rows for an exercise (RW-22): the planner's target load wins (it already holds
 * the double-progression step); otherwise last session's set at the same position, then the last
 * one; reps start at the bottom of the target range, or last time's reps when there is no target.
 */
export function prefillSets(opts: {
  targetSets: number | null | undefined;
  targetReps: string | null | undefined;
  targetLoad: number | null | undefined;
  previous: Pick<SetLike, 'type' | 'weightKg' | 'reps'>[];
  cardio?: boolean;
}): Prefill[] {
  const prev = opts.previous;
  const count = Math.max(1, opts.targetSets ?? (prev.length || 3));
  const [lo] = parseRepRange(opts.targetReps);
  const out: Prefill[] = [];
  for (let i = 0; i < count; i++) {
    const p = prev[i] ?? prev[prev.length - 1];
    if (opts.cardio) {
      out.push({ type: 'cardio', weightKg: null, reps: null });
      continue;
    }
    const type: SetType = prev[i]?.type === 'warmup' ? 'warmup' : 'working';
    out.push({
      type,
      weightKg: opts.targetLoad ?? p?.weightKg ?? null,
      reps: opts.targetReps ? lo : (p?.reps ?? lo),
    });
  }
  return out;
}

/** Fraction of the planned sets that are done, for the ride-progress bar (0–1). */
export function doneFraction(sets: Pick<SetLike, 'doneAt'>[]): number {
  if (sets.length === 0) return 0;
  return sets.filter(isDone).length / sets.length;
}

/** Index of the first not-done set, or -1 when all are done. */
export function nextSetIndex(sets: Pick<SetLike, 'doneAt'>[]): number {
  return sets.findIndex((s) => !isDone(s));
}
