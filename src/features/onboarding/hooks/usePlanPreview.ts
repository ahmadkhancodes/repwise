import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { useMemo } from 'react';

import { sessionExercises, sessions } from '@/db/schema';
import { useMealPlan, useMeals } from '@/features/meals/repo';
import { addDays, startOfWeek, weekDates, type NutritionTargets } from '@/features/planner/engine';
import type { NutritionPayload } from '@/features/planner/logic/planRows';
import { useLatestPlan } from '@/features/planner/repo';
import { useProfile } from '@/features/settings/repo';
import { sessionExercisesRepo, sessionsRepo } from '@/features/workout/repo';
import { useCatalog } from '@/services/catalog';

import { mealKcal, nextTraining, weekStrip, type StripDay } from '../logic/reveal';

export type PreviewMeal = { id: string; slot: string; title: string; kcal: number };

export type PlanPreview = {
  ready: boolean;
  strip: StripDay[];
  nextTrainingDay: StripDay | null;
  today: {
    title: string | null;
    exerciseNames: string[];
    exerciseCount: number;
  };
  kcal: number;
  macros: { protein: number; carbs: number; fat: number };
  meals: PreviewMeal[];
  nutrition: NutritionTargets | null;
  sessionMin: number | null;
};

/**
 * Everything the reveal shows, read LIVE from SQLite (so the preview always matches the saved plan,
 * including when the AI version replaces the rules version a moment later).
 */
export function usePlanPreview(today: string): PlanPreview {
  const weekStart = startOfWeek(today);
  const dates = useMemo(() => weekDates(weekStart), [weekStart]);
  const weekEnd = addDays(weekStart, 6);
  const catalog = useCatalog();
  const profile = useProfile();
  const nutritionPlan = useLatestPlan('nutrition');

  const week = sessionsRepo.useLive(
    and(gte(sessions.date, weekStart), lte(sessions.date, weekEnd)),
    asc(sessions.date),
    [weekStart, weekEnd],
  ).data;
  const todaySession = week.find((s) => s.date === today) ?? null;
  const exercises = sessionExercisesRepo.useLive(
    eq(sessionExercises.sessionId, todaySession?.id ?? ''),
    asc(sessionExercises.position),
    [todaySession?.id ?? ''],
  ).data;

  const mealPlan = useMealPlan(today);
  const mealRows = useMeals(mealPlan?.id ?? '');

  return useMemo(() => {
    const strip = weekStrip(dates, week, today);
    const exName = (id: string) => catalog?.exerciseById.get(id)?.name ?? 'Exercise';
    const payload = nutritionPlan?.payload as NutritionPayload | undefined;
    return {
      ready: Boolean(mealPlan || todaySession || week.length),
      strip,
      nextTrainingDay: nextTraining(strip, today),
      today: {
        title: todaySession?.title ?? null,
        exerciseNames: exercises.map((e) => exName(e.exerciseId)),
        exerciseCount: exercises.length,
      },
      kcal: mealPlan?.kcalTarget ?? 0,
      macros: {
        protein: mealPlan?.macros?.protein ?? 0,
        carbs: mealPlan?.macros?.carbs ?? 0,
        fat: mealPlan?.macros?.fat ?? 0,
      },
      meals: mealRows.map((m) => {
        const r = m.recipeId ? catalog?.recipeById.get(m.recipeId) : undefined;
        return {
          id: m.id,
          slot: m.slot,
          title: r?.title ?? 'Meal',
          kcal: mealKcal(r?.perServing.kcal, m.portion),
        };
      }),
      nutrition: payload?.kind === 'nutrition' ? payload.nutrition : null,
      sessionMin: profile?.sessionMin ?? null,
    };
  }, [
    dates,
    week,
    today,
    catalog,
    nutritionPlan,
    mealPlan,
    todaySession,
    exercises,
    mealRows,
    profile,
  ]);
}
