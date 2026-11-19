import type { DayPhase } from './day';
import { remaining, type DayTargets, type Nutrients } from './meals';
import { workoutMeta } from './workout';

export type BriefWorkout = {
  title: string;
  minutes: number;
  exercises: number;
  done: boolean;
};

export type BriefMeal = { time: string | null; title: string; kcal: number };

export type BriefRow = { kind: 'workout' | 'rest' | 'meal' | 'done'; title: string; meta: string };

/** W2 "today in one glance": the workout (or rest) line and the next meal line. */
export function briefRows(input: {
  workout: BriefWorkout | null;
  restDay: boolean;
  nextMeal: BriefMeal | null;
  mealsLeft: number;
}): BriefRow[] {
  const rows: BriefRow[] = [];
  if (input.workout) {
    rows.push({
      kind: input.workout.done ? 'done' : 'workout',
      title: input.workout.title,
      meta: input.workout.done
        ? 'Done today'
        : workoutMeta(input.workout.minutes, input.workout.exercises),
    });
  } else if (input.restDay) {
    rows.push({ kind: 'rest', title: 'Rest day', meta: 'Recovery is part of the plan' });
  }
  if (input.nextMeal) {
    const when = input.nextMeal.time ? `${input.nextMeal.time} · ` : 'Next · ';
    rows.push({
      kind: 'meal',
      title: input.nextMeal.title,
      meta: `${when}${input.nextMeal.kcal.toLocaleString('en-US')} kcal`,
    });
  } else if (input.mealsLeft === 0) {
    rows.push({ kind: 'done', title: 'All meals logged', meta: 'Nothing left to eat today' });
  }
  return rows;
}

export type EveningItem = { id: 'workout' | 'meals' | 'protein'; label: string; done: boolean };

/** Evening progress: what got done today. Supportive copy only. */
export function eveningSummary(input: {
  workout: { done: boolean } | null;
  mealsEaten: number;
  mealsTotal: number;
  eaten: Nutrients;
  targets: DayTargets | null;
}): { headline: string; items: EveningItem[] } {
  const items: EveningItem[] = [];
  if (input.workout) {
    items.push({
      id: 'workout',
      label: input.workout.done ? 'Workout done' : 'Workout still open',
      done: input.workout.done,
    });
  }
  if (input.mealsTotal > 0) {
    items.push({
      id: 'meals',
      label: `${input.mealsEaten} of ${input.mealsTotal} meals eaten`,
      done: input.mealsEaten >= input.mealsTotal,
    });
  }
  if (input.targets && input.targets.p > 0) {
    const left = remaining(input.eaten.p, input.targets.p);
    items.push({
      id: 'protein',
      label: left === 0 ? 'Protein target hit' : `${left} g protein to go`,
      done: left === 0,
    });
  }
  const done = items.filter((i) => i.done).length;
  const headline =
    items.length === 0
      ? 'A calm day'
      : done === items.length
        ? 'Everything done. Nice work.'
        : done > 0
          ? 'Good progress today'
          : 'There is still time today';
  return { headline, items };
}

export type TomorrowPreview = { title: string; meta: string; restDay: boolean };

export function tomorrowPreview(input: {
  workout: { title: string; minutes: number; exercises: number } | null;
  hasPlan: boolean;
  firstMeal: { title: string; time: string | null } | null;
}): TomorrowPreview | null {
  if (!input.hasPlan && !input.firstMeal) return null;
  const mealLine = input.firstMeal
    ? `${input.firstMeal.time ? `${input.firstMeal.time} ` : ''}${input.firstMeal.title}`
    : null;
  if (input.workout) {
    const meta = workoutMeta(input.workout.minutes, input.workout.exercises);
    return { title: input.workout.title, meta: mealLine ? `${meta} · ${mealLine}` : meta, restDay: false };
  }
  return { title: 'Rest day', meta: mealLine ?? 'Recovery is part of the plan', restDay: true };
}

/** The evening card shows from 18:00, or earlier once the day's plan is complete. */
export function showEvening(phase: DayPhase, allDone: boolean): boolean {
  return phase === 'evening' || allDone;
}
