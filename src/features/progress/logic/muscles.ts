/**
 * Muscle maths for the heatmap (S32) and weekly volume (Trends). The fatigue model and the
 * set-credit rules (1 per primary, 0.5 per secondary) live in the engine's `muscleHeatmap`;
 * here we only adapt catalogue exercises and bucket sets by week.
 */
import {
  MUSCLES,
  muscleHeatmap,
  startOfWeek,
  addDays,
  type EngineExercise,
  type Heatmap,
  type ISODate,
  type Muscle,
  type SetLog,
} from './engine';
import { startOfLocalDay } from './dates';
import type { LoggedSet } from './workouts';

/** What we need from a catalogue (or custom) exercise. */
export type MuscleSource = {
  id: string;
  primaryMuscles?: readonly string[] | null;
  secondaryMuscles?: readonly string[] | null;
};

const MUSCLE_SET = new Set<string>(MUSCLES);
const known = (list: readonly string[] | null | undefined): Muscle[] =>
  (list ?? []).filter((m): m is Muscle => MUSCLE_SET.has(m));

/**
 * Map for the engine. Muscles the engine doesn't model (e.g. hip flexors) are dropped; the
 * heatmap only reads id + muscles, so the rest of the engine Exercise shape is not needed.
 */
export function engineExerciseMap(
  list: readonly MuscleSource[],
): ReadonlyMap<string, EngineExercise> {
  const out = new Map<string, EngineExercise>();
  for (const e of list) {
    const primary = known(e.primaryMuscles);
    if (primary.length === 0) continue;
    out.set(e.id, {
      id: e.id,
      primaryMuscles: primary,
      secondaryMuscles: known(e.secondaryMuscles).filter((m) => !primary.includes(m)),
    } as unknown as EngineExercise);
  }
  return out;
}

export function toSetLogs(sets: readonly LoggedSet[]): SetLog[] {
  return sets.map((s) => ({
    exerciseId: s.exerciseId,
    doneAt: s.doneAt,
    type: s.type,
    weightKg: s.weightKg,
    reps: s.reps,
  }));
}

/** Engine recovery heatmap at `now` (7-day lookback). */
export function recoveryHeatmap(
  sets: readonly LoggedSet[],
  exById: ReadonlyMap<string, EngineExercise>,
  now: number,
): Heatmap {
  return muscleHeatmap(toSetLogs(sets), exById, now, 7);
}

/** Muscles ordered by fatigue (most worked first), with a 0..1 intensity for the map. */
export function rankMuscles(
  map: Heatmap,
): { muscle: Muscle; fatigue: number; recovery: number; sets: number }[] {
  return MUSCLES.map((m) => ({
    muscle: m,
    fatigue: map[m].fatigue,
    recovery: map[m].recovery,
    sets: map[m].setsLast7d,
  })).sort((a, b) => b.fatigue - a.fatigue || b.sets - a.sets || a.muscle.localeCompare(b.muscle));
}

/** Sets are pre-bucketed, so the engine lookback only has to be wide enough to include them. */
const BUCKET_LOOKBACK_DAYS = 366;

export type WeekMuscleVolume = {
  weekStart: ISODate;
  total: number;
  byMuscle: Record<Muscle, number>;
};

/**
 * Hard-set credit per muscle for each week (Mon–Sun, local). Sets are bucketed into the week
 * first (so DST weeks are exact), then the engine counts credit with no decay.
 */
export function weeklyMuscleVolume(
  sets: readonly LoggedSet[],
  exById: ReadonlyMap<string, EngineExercise>,
  weekStarts: readonly ISODate[],
): WeekMuscleVolume[] {
  return weekStarts.map((weekStart) => {
    const monday = startOfWeek(weekStart);
    const end = addDays(monday, 7);
    const inWeek = sets.filter((s) => s.date >= monday && s.date < end);
    // Already bucketed by date: evaluate at the last set with a lookback that covers them all.
    const now = inWeek.length ? Math.max(...inWeek.map((s) => s.doneAt)) : startOfLocalDay(end) - 1;
    const map = muscleHeatmap(toSetLogs(inWeek), exById, now, BUCKET_LOOKBACK_DAYS);
    const byMuscle = Object.fromEntries(MUSCLES.map((m) => [m, map[m].setsLast7d])) as Record<
      Muscle,
      number
    >;
    const total = MUSCLES.reduce((a, m) => a + byMuscle[m], 0);
    return { weekStart: monday, total, byMuscle };
  });
}

const LABELS: Record<Muscle, string> = {
  chest: 'Chest',
  lats: 'Lats',
  upper_back: 'Upper back',
  traps: 'Traps',
  front_delts: 'Front delts',
  side_delts: 'Side delts',
  rear_delts: 'Rear delts',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  abs: 'Abs',
  obliques: 'Obliques',
  hip_flexors: 'Hip flexors',
  lower_back: 'Lower back',
  glutes: 'Glutes',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  adductors: 'Adductors',
  abductors: 'Abductors',
  calves: 'Calves',
};

export function muscleLabel(m: Muscle): string {
  return LABELS[m];
}

/** Calm, plain-language recovery state (no medical claims). */
export function recoveryLabel(recovery: number): 'Fresh' | 'Recovering' | 'Worked' {
  if (recovery >= 0.75) return 'Fresh';
  if (recovery >= 0.4) return 'Recovering';
  return 'Worked';
}
