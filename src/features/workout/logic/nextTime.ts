import { doubleProgression, roundToIncrement, type Prescription, type WeightUnit } from './engine';
import { parseRepRange, countsAsWork, isDone, type SetLike } from './sets';
import { fromDisplayWeight, toDisplayWeight, weightStep } from './units';

/** Patterns that take the lower-body load jump (+5 kg / +10 lb) in the engine's double progression. */
const LOWER_BODY = new Set([
  'squat',
  'hinge',
  'lunge',
  'isolation_quads',
  'isolation_hamstrings',
  'isolation_glutes',
  'isolation_calves',
]);

export function isLowerBody(pattern: string | undefined): boolean {
  return pattern !== undefined && LOWER_BODY.has(pattern);
}

export function isBodyweight(equipment: readonly string[] | undefined): boolean {
  return !!equipment && equipment.length > 0 && equipment.every((e) => e === 'bodyweight');
}

export type NextTime = Prescription & { text: string };

/**
 * "Next time" for one exercise (RW-12), computed by the engine's double progression from this
 * session's done work sets. Weights go through the user's unit so +2.5 kg / +5 lb steps land on
 * real plates. Null when nothing was logged (cardio, skipped).
 */
export function nextTimeFor(opts: {
  sets: SetLike[];
  targetReps: string | null | undefined;
  pattern: string | undefined;
  equipment: readonly string[] | undefined;
  unit: WeightUnit;
}): NextTime | null {
  const work = opts.sets.filter((s) => isDone(s) && countsAsWork(s) && (s.reps ?? 0) > 0);
  if (work.length === 0) return null;
  const bodyweight = isBodyweight(opts.equipment) || work.every((s) => !s.weightKg);
  const p = doubleProgression({
    lastSets: work.map((s) => ({
      weight: s.weightKg ? toDisplayWeight(s.weightKg, opts.unit) : 0,
      reps: s.reps ?? 0,
      ...(s.rpe != null ? { rpe: s.rpe } : {}),
    })),
    repRange: parseRepRange(opts.targetReps),
    lowerBody: isLowerBody(opts.pattern),
    bodyweight,
    unit: opts.unit,
  });
  const shown =
    p.weight != null && !bodyweight ? roundToIncrement(p.weight, weightStep(opts.unit) / 2) : null;
  const weightKg = shown != null ? fromDisplayWeight(shown, opts.unit) : null;
  const text =
    shown != null ? `${shown} ${opts.unit} × ${p.targetReps}` : `${p.targetReps} reps`;
  return { ...p, weight: weightKg, text };
}

export function nextTimeHeadline(p: Prescription): string {
  switch (p.action) {
    case 'increase_load':
      return 'Add weight';
    case 'increase_reps':
      return 'Add a rep';
    case 'hold':
      return 'Hold and own it';
    default:
      return 'Find your weight';
  }
}
