/**
 * Today (S11) data: one synchronous snapshot of local SQLite (renders from cache in well under
 * 300 ms, sheet 11). Writes go through the meals domain (`@/features/meals`). No network.
 */
import { mealPlanForDate, mealsForPlan, type Meal, type MealPlan } from '@/features/meals/repo';
import { logsForDate, type FoodLog } from '@/features/nutrition/repo';
import { latestPlan } from '@/features/planner/repo';
import { getProfile, type Profile } from '@/features/settings/repo';
import {
  exercisesForSession,
  sessionsForDate,
  type Session,
  type SessionExercise,
} from '@/features/workout/repo';

import { pickTodaySession } from './logic/workout';

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
