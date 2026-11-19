/**
 * Today (S11) data: one synchronous snapshot of local SQLite (renders from cache in well under
 * 300 ms, sheet 11) plus the core-loop writes. Nothing here touches the network.
 */
import { and, desc, eq, isNull } from 'drizzle-orm';

import { foodLogs } from '@/db/schema';
import { mealPlanForDate, mealsForPlan, setMealStatus, swapMeal, type Meal, type MealPlan } from '@/features/meals/repo';
import { foodLogsRepo, logsForDate, type FoodLog } from '@/features/nutrition/repo';
import { latestPlan } from '@/features/planner/repo';
import { getProfile, type Profile } from '@/features/settings/repo';
import {
  exercisesForSession,
  sessionsForDate,
  type Session,
  type SessionExercise,
} from '@/features/workout/repo';

import { GLASS_ML, isWaterLog, WATER_SLOT, waterLogName } from './logic/water';
import { pickTodaySession } from './logic/workout';
import type { Nutrients } from './logic/meals';

export type DayData = {
  session: Session | undefined;
  exercises: SessionExercise[];
  mealPlan: MealPlan | undefined;
  meals: Meal[];
};

export type TodaySnapshot = {
  date: string;
  profile: Profile | undefined;
  hasTrainingPlan: boolean;
  today: DayData;
  tomorrow: DayData;
  logs: FoodLog[];
};

function loadDay(date: string): DayData {
  const session = pickTodaySession(sessionsForDate(date));
  const mealPlan = mealPlanForDate(date);
  return {
    session,
    exercises: session ? exercisesForSession(session.id) : [],
    mealPlan,
    meals: mealPlan ? mealsForPlan(mealPlan.id) : [],
  };
}

export function loadTodaySnapshot(date: string, tomorrow: string): TodaySnapshot {
  return {
    date,
    profile: getProfile(),
    hasTrainingPlan: latestPlan('training') !== undefined,
    today: loadDay(date),
    tomorrow: loadDay(tomorrow),
    logs: logsForDate(date),
  };
}

/** Tables the Today snapshot reads (it reloads when any of them changes). */
export const TODAY_TABLES = [
  'profile',
  'plans',
  'sessions',
  'session_exercises',
  'meal_plans',
  'meals',
  'food_logs',
  'cards',
  'sets',
  'body_metrics',
] as const;

/**
 * Core action (P5): tick a planned meal as eaten and log it for the rings, in one tap.
 * Returns an undo that restores both writes.
 */
export function tickMeal(
  meal: Pick<Meal, 'id' | 'slot'>,
  date: string,
  title: string,
  n: Nutrients,
  now: number = Date.now(),
): () => void {
  setMealStatus(meal.id, 'eaten', now);
  const log = foodLogsRepo.insert(
    { date, source: 'plan', name: title, slot: meal.slot, kcal: n.kcal, p: n.p, c: n.c, f: n.f },
    now,
  );
  return () => {
    foodLogsRepo.remove(log.id);
    setMealStatus(meal.id, 'planned');
  };
}

/** Untick: back to planned, and remove the plan log written by the tick (newest match). */
export function untickMeal(meal: Pick<Meal, 'id' | 'slot'>, date: string, title: string): void {
  setMealStatus(meal.id, 'planned');
  const log = foodLogsRepo.first(
    and(
      eq(foodLogs.date, date),
      eq(foodLogs.source, 'plan'),
      eq(foodLogs.slot, meal.slot),
      eq(foodLogs.name, title),
      isNull(foodLogs.deletedAt),
    ),
    desc(foodLogs.createdAt),
  );
  if (log) foodLogsRepo.remove(log.id);
}

/** Swap a planned meal to another recipe (the meals repo keeps the old one in swapped_from). */
export function applySwap(mealId: string, recipeId: string): Meal | undefined {
  return swapMeal(mealId, recipeId);
}

/** Water quick-add: one 250 ml glass. Returns an undo. */
export function addWater(date: string, ml: number = GLASS_ML, now: number = Date.now()): () => void {
  const row = foodLogsRepo.insert(
    { date, source: 'quick', name: waterLogName(ml), slot: WATER_SLOT, kcal: 0 },
    now,
  );
  return () => {
    foodLogsRepo.remove(row.id);
  };
}

/** Food logs that count toward the rings (everything except water). */
export function nutritionLogs(logs: FoodLog[]): FoodLog[] {
  return logs.filter((l) => !isWaterLog(l));
}
