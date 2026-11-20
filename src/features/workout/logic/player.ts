/**
 * Pure helpers for the live player (S13/S14): what is next, how far along the workout is, and
 * the numbers the gym-size controls show. Everything works on in-memory rows, so a set tick never
 * has to re-query SQLite to know what comes next (A3).
 */
import type { WeightUnit } from './engine';
import type { RestNext } from './restTimer';
import { setLabels, type SetLike } from './sets';
import { formatWeight, trimNumber, weightStep } from './units';

/** The parts of a player item these helpers read (PlayerItem satisfies it). */
export type ItemLike<S extends SetLike & { id: string } = SetLike & { id: string }> = {
  se: { id: string; exerciseId: string };
  meta: { name: string; cardio: boolean; equipment?: string[] };
  sets: S[];
  labels?: string[];
};

/** `done` as shown: the optimistic answer when given, else the stored row. */
export type DoneOf = (set: SetLike & { id: string }) => boolean;
export const storedDone: DoneOf = (s) => s.doneAt != null;

export type Pending<I extends ItemLike> = {
  item: I;
  itemIndex: number;
  set: I['sets'][number];
  setIndex: number;
  /** Set column label ("1", "W", "D"…). */
  label: string;
};

/** First set not yet done, walking exercises in order (the footer's "Log set"). */
export function nextPending<I extends ItemLike>(
  items: readonly I[],
  isDone: DoneOf = storedDone,
): Pending<I> | null {
  for (let i = 0; i < items.length; i++) {
    const item = items[i] as I;
    const labels = item.labels ?? setLabels(item.sets);
    for (let j = 0; j < item.sets.length; j++) {
      const set = item.sets[j] as I['sets'][number];
      if (!isDone(set))
        return { item, itemIndex: i, set, setIndex: j, label: labels[j] ?? String(j + 1) };
    }
  }
  return null;
}

/** Who comes after `setId` (rest timer + "Rest over" copy), from memory: no query. */
export function nextAfter<I extends ItemLike>(
  items: readonly I[],
  setId: string,
  isDone: DoneOf = storedDone,
  unit: WeightUnit = 'kg',
): RestNext | null {
  let passed = false;
  for (const item of items) {
    const labels = item.labels ?? setLabels(item.sets);
    for (let j = 0; j < item.sets.length; j++) {
      const s = item.sets[j] as I['sets'][number];
      if (s.id === setId) {
        passed = true;
        continue;
      }
      if (passed && !isDone(s)) {
        const n = Number(labels[j]);
        const detail = setTarget(s, unit, item.meta.cardio);
        return {
          exercise: item.meta.name,
          setNo: Number.isFinite(n) ? n : j + 1,
          ...(detail ? { detail } : {}),
        };
      }
    }
  }
  return null;
}

export type WorkoutProgress = {
  /** 1-based exercise the user is on (the last one once everything is done). */
  exerciseNo: number;
  exerciseCount: number;
  /** 1-based set within that exercise. */
  setNo: number;
  setCount: number;
  setsDone: number;
  setsTotal: number;
  /** Per-exercise 0..1 fill for StepProgress. */
  fractions: number[];
  complete: boolean;
};

export function workoutProgress(
  items: readonly ItemLike[],
  isDone: DoneOf = storedDone,
): WorkoutProgress {
  const fractions = items.map((i) =>
    i.sets.length ? i.sets.filter(isDone).length / i.sets.length : 0,
  );
  const setsTotal = items.reduce((a, i) => a + i.sets.length, 0);
  const setsDone = items.reduce((a, i) => a + i.sets.filter(isDone).length, 0);
  const pending = nextPending(items, isDone);
  const idx = pending ? pending.itemIndex : Math.max(0, items.length - 1);
  const cur = items[idx];
  return {
    exerciseNo: items.length ? idx + 1 : 0,
    exerciseCount: items.length,
    setNo: pending ? pending.setIndex + 1 : (cur?.sets.length ?? 0),
    setCount: cur?.sets.length ?? 0,
    setsDone,
    setsTotal,
    fractions,
    complete: setsTotal > 0 && setsDone === setsTotal,
  };
}

/** "80 kg × 8", "12 reps", "20 min · 3 km"; '' when the set has no values yet. */
export function setTarget(
  s: Pick<SetLike, 'weightKg' | 'reps' | 'durationS' | 'distanceM'>,
  unit: WeightUnit,
  cardio = false,
): string {
  if (cardio) {
    const min = s.durationS ? `${trimNumber(Math.round((s.durationS / 60) * 10) / 10)} min` : '';
    const km = s.distanceM
      ? `${trimNumber(Math.round((unit === 'lb' ? s.distanceM / 1609.344 : s.distanceM / 1000) * 100) / 100)} ${unit === 'lb' ? 'mi' : 'km'}`
      : '';
    return [min, km].filter(Boolean).join(' · ');
  }
  const w = formatWeight(s.weightKg, unit);
  if (w && s.reps != null) return `${w} ${unit} × ${s.reps}`;
  if (w) return `${w} ${unit}`;
  return s.reps != null ? `${s.reps} reps` : '';
}

/**
 * Stepper step for a weight (in the display unit): dumbbells, kettlebells and machines move in
 * small jumps (1 kg / 2.5 lb); barbells and everything else in the smallest plate pair
 * (2.5 kg / 5 lb).
 */
export function plateStep(unit: WeightUnit, equipment: readonly string[] = []): number {
  const small = equipment.some((e) => /dumbbell|kettlebell|cable|machine/i.test(e));
  if (small) return unit === 'lb' ? 2.5 : 1;
  return weightStep(unit);
}

/** Largest weight the editor allows (display unit). */
export function maxWeight(unit: WeightUnit): number {
  return unit === 'lb' ? 1500 : 700;
}

type Values = Pick<SetLike, 'weightKg' | 'reps' | 'durationS' | 'distanceM'>;
export type ValuesPatch = Partial<
  Record<'weightKg' | 'reps' | 'durationS' | 'distanceM', number | null>
>;

/**
 * Ticking an empty set takes last time's values, like a coach would ("same as last time"):
 * only the fields the set has no value for. Pure.
 */
export function prefillPatch(
  set: Values,
  previous: Values | undefined,
  cardio: boolean,
): ValuesPatch {
  const patch: ValuesPatch = {};
  if (!previous) return patch;
  const keys = cardio ? (['durationS', 'distanceM'] as const) : (['weightKg', 'reps'] as const);
  for (const k of keys) if (set[k] == null && previous[k] != null) patch[k] = previous[k];
  return patch;
}
