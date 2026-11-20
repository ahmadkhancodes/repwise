/**
 * Reads the local database into the plain shapes the pure schedule builder and the widget
 * snapshot need. Synchronous local SQLite only — never the network.
 */
import { eq } from 'drizzle-orm';

import { sessions } from '@/db/schema';
import { mealPlanForDate, mealsForPlan, customRecipesRepo, type Meal } from '@/features/meals/repo';
import { logsForDate } from '@/features/nutrition/repo';
import { getProfile } from '@/features/settings/repo';
import { exercisesForSession, sessionsForDate, sessionsRepo } from '@/features/workout/repo';
import { getRecipe } from '@/services/catalog';
import {
  eatenTotals,
  emptySnapshot,
  pickNextMeal,
  weeksInARow,
  type MealForSnapshot,
  type WidgetSnapshot,
} from '@/widgets/snapshot';

import { slotLabel } from './logic/copy';
import { resolveMealTimes, type MealSlot, type NotificationPrefs } from './logic/prefs';
import type { DayPlan, PlannedMeal, PlannedWorkout } from './logic/schedule';
import { formatHm, wallClock, type LocalDate } from './logic/zonedTime';

type MealInfo = { name: string; kcal: number; p: number; c: number; f: number };

/** Dish name and per-portion macros from the catalogue or a user recipe. */
export function mealInfo(meal: Pick<Meal, 'recipeId' | 'portion' | 'slot'>): MealInfo {
  const portion = meal.portion || 1;
  const fallback: MealInfo = { name: slotLabel(meal.slot), kcal: 0, p: 0, c: 0, f: 0 };
  if (!meal.recipeId) return fallback;
  const custom = customRecipesRepo.get(meal.recipeId);
  if (custom) {
    return {
      name: custom.title,
      kcal: Math.round((custom.kcal ?? 0) * portion),
      p: (custom.protein ?? 0) * portion,
      c: (custom.carb ?? 0) * portion,
      f: (custom.fat ?? 0) * portion,
    };
  }
  try {
    const r = getRecipe(meal.recipeId);
    if (!r) return fallback;
    return {
      name: r.title,
      kcal: Math.round(r.perServing.kcal * portion),
      p: r.perServing.protein * portion,
      c: r.perServing.carbs * portion,
      f: r.perServing.fat * portion,
    };
  } catch {
    return fallback;
  }
}

function workoutFor(date: LocalDate, sessionMin: number | null | undefined): PlannedWorkout | null {
  const s = sessionsForDate(date).find((x) => x.status !== 'skipped') ?? null;
  if (!s) return null;
  return {
    sessionId: s.id,
    title: s.title || 'Workout',
    exercises: exercisesForSession(s.id).length,
    minutes: sessionMin ?? null,
    status: s.status ?? null,
  };
}

function mealsFor(date: LocalDate): { meal: Meal; info: MealInfo }[] {
  const plan = mealPlanForDate(date);
  if (!plan) return [];
  return mealsForPlan(plan.id).map((meal) => ({ meal, info: mealInfo(meal) }));
}

/** One DayPlan per date (days with no workout and no meals are left out). */
export function loadDayPlans(dates: LocalDate[]): DayPlan[] {
  const profile = getProfile();
  const out: DayPlan[] = [];
  for (const date of dates) {
    const workout = workoutFor(date, profile?.sessionMin);
    const meals: PlannedMeal[] = mealsFor(date).map(({ meal, info }) => ({
      mealId: meal.id,
      slot: meal.slot,
      name: info.name,
      kcal: info.kcal,
      protein: info.p,
      status: meal.status,
    }));
    if (workout || meals.length) out.push({ date, workout, meals });
  }
  return out;
}

export function loadProfileMealTimes(): unknown {
  return getProfile()?.mealTimes ?? null;
}

/** Everything the widgets show for `now` in `timeZone`. */
export function loadSnapshot(
  now: number,
  timeZone: string,
  prefs: NotificationPrefs,
  pro: boolean,
): WidgetSnapshot {
  const clock = wallClock(now, timeZone);
  const date = clock.date;
  const snap = emptySnapshot(date, now, pro);
  const profile = getProfile();
  const w = workoutFor(date, profile?.sessionMin);
  if (w) snap.workout = { ...w, minutes: w.minutes ?? 0, status: w.status ?? 'planned' };

  const times = resolveMealTimes(prefs, profile?.mealTimes);
  const meals: MealForSnapshot[] = mealsFor(date).map(({ meal, info }) => ({
    id: meal.id,
    slot: meal.slot,
    name: info.name,
    kcal: info.kcal,
    p: info.p,
    c: info.c,
    f: info.f,
    status: meal.status,
    time: times[meal.slot as MealSlot] ?? '12:00',
  }));
  const next = pickNextMeal(meals, formatHm(clock.minute));
  if (next) {
    snap.nextMeal = { id: next.id, slot: next.slot, label: slotLabel(next.slot), name: next.name, kcal: next.kcal, time: next.time };
  }

  const logs = logsForDate(date).map((l) => ({
    slot: l.slot,
    source: l.source,
    kcal: l.kcal ?? 0,
    p: l.p ?? 0,
    c: l.c ?? 0,
    f: l.f ?? 0,
    mealId: l.mealId ?? null,
  }));
  const eaten = eatenTotals(logs, meals);
  const plan = mealPlanForDate(date);
  snap.kcal = { eaten: eaten.kcal, target: plan?.kcalTarget ?? 0 };
  snap.macros = {
    p: { eaten: eaten.p, target: Math.round(plan?.macros?.protein ?? 0) },
    c: { eaten: eaten.c, target: Math.round(plan?.macros?.carbs ?? 0) },
    f: { eaten: eaten.f, target: Math.round(plan?.macros?.fat ?? 0) },
  };

  const done = sessionsRepo
    .list(eq(sessions.status, 'done'))
    .map((s) => s.date)
    .filter((d): d is string => Boolean(d));
  snap.streakWeeks = weeksInARow(done, date);
  return snap;
}
