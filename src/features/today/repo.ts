/**
 * Today (S11) data: one synchronous snapshot of local SQLite (renders from cache in well under
 * 300 ms, sheet 11). Writes go through the meals domain (`@/features/meals`). No network.
 */
import { and, between, eq, isNull } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { sessions } from '@/db/schema';
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
  /** This week's training (Mon–Sun): planned sessions and how many are done. */
  week: { planned: number; done: number };
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

/** Sessions in [from, to] (one indexed range query, status only). */
export function weekTraining(from: string, to: string): { planned: number; done: number } {
  const rows = getDb()
    .select({ status: sessions.status })
    .from(sessions)
    .where(and(between(sessions.date, from, to), isNull(sessions.deletedAt)))
    .all();
  return { planned: rows.length, done: rows.filter((r) => r.status === 'done').length };
}

/** Dates with a finished workout (for the week streak; read only at a success moment). */
export function doneWorkoutDates(): string[] {
  return getDb()
    .selectDistinct({ date: sessions.date })
    .from(sessions)
    .where(and(eq(sessions.status, 'done'), isNull(sessions.deletedAt)))
    .all()
    .flatMap((r) => (r.date ? [r.date] : []));
}

export function loadTodaySnapshot(date: string, tomorrow: string, weekFrom = date, weekTo = date): TodaySnapshot {
  return {
    date,
    profile: getProfile(),
    hasTrainingPlan: latestPlan('training') !== undefined,
    today: loadDay(date),
    tomorrow: loadDay(tomorrow),
    logs: logsForDate(date),
    week: weekTraining(weekFrom, weekTo),
  };
}

/**
 * Tables the Today snapshot reads (it reloads when any of them changes). Narrow on purpose: a set
 * logged in the player (`sets`), a body metric or an assistant card (its own hook) never re-runs
 * the Today queries (perf audit A2).
 */
export const TODAY_TABLES = [
  'profile',
  'plans',
  'sessions',
  'session_exercises',
  'meal_plans',
  'meals',
  'food_logs',
] as const;
