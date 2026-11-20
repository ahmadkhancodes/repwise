/**
 * Builds the Today view model from a local snapshot. Pure (the snapshot, recipe/exercise lookups
 * and the clock are inputs), so every state of S11 is unit-tested without rendering.
 */
import type { MealStatus, SessionStatus } from '@/db/schema';
import { isWaterLog, totalWaterMl } from '@/features/nutrition/logic/water';

import { briefRows, eveningSummary, showEvening, tomorrowPreview, type BriefRow, type EveningItem, type TomorrowPreview } from './brief';
import { dayPhase, greeting, longDate, type DayPhase } from './day';
import {
  assignTimes,
  countEaten,
  dayTargets,
  nextMeal,
  portionNutrients,
  slotLabel,
  sumNutrients,
  type DayTargets,
  type MealView,
  type Nutrients,
  type PerServing,
} from './meals';
import { estimateMinutes, topMuscles } from './workout';

export type RecipeInfo = { title: string; perServing: PerServing };
export type RecipeLookup = (id: string) => RecipeInfo | undefined;
export type MusclesLookup = (exerciseId: string) => string[];

export type SnapshotDay = {
  session:
    | { id: string; title: string | null; status: SessionStatus | null }
    | undefined;
  exercises: { exerciseId: string; targetSets: number | null; restS: number | null }[];
  mealPlan:
    | {
        id: string;
        dayType: 'training' | 'rest' | null;
        kcalTarget: number | null;
        macros: { protein: number; carbs: number; fat: number } | null;
      }
    | undefined;
  meals: { id: string; slot: string; recipeId: string | null; portion: number; status: MealStatus }[];
};

export type ViewSnapshot = {
  date: string;
  profile:
    | { name: string | null; onboardedAt: number | null; mealTimes: string[] | null }
    | undefined;
  hasTrainingPlan: boolean;
  today: SnapshotDay;
  tomorrow: SnapshotDay;
  logs: { slot: string | null; name: string; kcal: number; p: number | null; c: number | null; f: number | null }[];
};

export type WorkoutView = {
  sessionId: string;
  title: string;
  minutes: number;
  exercises: number;
  muscles: string[];
  status: SessionStatus;
  done: boolean;
  inProgress: boolean;
};

export type TodayView = {
  state: 'not_onboarded' | 'no_plan' | 'ready';
  date: string;
  phase: DayPhase;
  greeting: string;
  dateLabel: string;
  workout: WorkoutView | null;
  restDay: boolean;
  meals: MealView[];
  next: MealView | undefined;
  eaten: Nutrients;
  planned: Nutrients;
  targets: DayTargets | null;
  waterMl: number;
  brief: BriefRow[];
  evening: { headline: string; items: EveningItem[]; tomorrow: TomorrowPreview | null } | null;
};

function workoutView(day: SnapshotDay, muscles: MusclesLookup): WorkoutView | null {
  const s = day.session;
  if (!s) return null;
  const status = s.status ?? 'planned';
  return {
    sessionId: s.id,
    title: s.title?.trim() || 'Workout',
    minutes: estimateMinutes(day.exercises),
    exercises: day.exercises.length,
    muscles: topMuscles(day.exercises.map((e) => muscles(e.exerciseId))),
    status,
    done: status === 'done',
    inProgress: status === 'active' || status === 'paused',
  };
}

function mealViews(day: SnapshotDay, recipe: RecipeLookup, mealTimes: string[] | null): MealView[] {
  const times = assignTimes(day.meals, mealTimes);
  return day.meals.map((m, i) => {
    const info = m.recipeId ? recipe(m.recipeId) : undefined;
    return {
      id: m.id,
      slot: m.slot,
      slotLabel: slotLabel(m.slot),
      time: times[i] ?? null,
      recipeId: m.recipeId,
      portion: m.portion,
      title: info?.title ?? slotLabel(m.slot),
      status: m.status,
      nutrients: portionNutrients(info?.perServing, m.portion),
    };
  });
}

export function buildTodayView(
  snap: ViewSnapshot,
  lookups: { recipe: RecipeLookup; muscles: MusclesLookup },
  nowMinutes: number,
  hour: number,
): TodayView {
  const phase = dayPhase(hour);
  const profile = snap.profile;
  const base = {
    date: snap.date,
    phase,
    greeting: greeting(phase, profile?.name),
    dateLabel: longDate(snap.date),
  };
  const meals = mealViews(snap.today, lookups.recipe, profile?.mealTimes ?? null);
  const workout = workoutView(snap.today, lookups.muscles);
  const nutritionLogs = snap.logs.filter((l) => !isWaterLog(l));
  const eaten = sumNutrients(
    nutritionLogs.map((l) => ({ kcal: l.kcal, p: l.p ?? 0, c: l.c ?? 0, f: l.f ?? 0 })),
  );
  const planned = sumNutrients(meals.map((m) => m.nutrients));
  const targets = dayTargets(snap.today.mealPlan, planned);
  const hasAnyPlan = snap.hasTrainingPlan || snap.today.mealPlan !== undefined || workout !== null;
  const restDay = !workout && (snap.hasTrainingPlan || snap.today.mealPlan?.dayType === 'rest');

  const state: TodayView['state'] = !profile?.onboardedAt
    ? 'not_onboarded'
    : !hasAnyPlan
      ? 'no_plan'
      : 'ready';

  const next = nextMeal(meals, nowMinutes);
  const mealsEaten = countEaten(meals);
  const brief = briefRows({
    workout: workout
      ? { title: workout.title, minutes: workout.minutes, exercises: workout.exercises, done: workout.done }
      : null,
    restDay,
    nextMeal: next ? { time: next.time, title: next.title, kcal: next.nutrients.kcal } : null,
    mealsLeft: meals.length - mealsEaten - meals.filter((m) => m.status === 'skipped').length,
  });

  const allDone = (workout ? workout.done : true) && meals.length > 0 && mealsEaten === meals.length;
  let evening: TodayView['evening'] = null;
  if (state === 'ready' && showEvening(phase, allDone)) {
    const tw = workoutView(snap.tomorrow, lookups.muscles);
    const tMeals = mealViews(snap.tomorrow, lookups.recipe, profile?.mealTimes ?? null);
    const first = tMeals[0];
    evening = {
      ...eveningSummary({ workout, mealsEaten, mealsTotal: meals.length, eaten, targets }),
      tomorrow: tomorrowPreview({
        workout: tw ? { title: tw.title, minutes: tw.minutes, exercises: tw.exercises } : null,
        hasPlan: snap.hasTrainingPlan || snap.tomorrow.mealPlan !== undefined,
        firstMeal: first ? { title: first.title, time: first.time } : null,
      }),
    };
  }
  return {
    ...base,
    state,
    workout,
    restDay,
    meals,
    next,
    eaten,
    planned,
    targets,
    waterMl: totalWaterMl(snap.logs),
    brief,
    evening,
  };
}
