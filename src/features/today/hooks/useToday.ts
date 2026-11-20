import { useEffect, useMemo } from 'react';

import { ensureWeekMeals } from '@/features/meals';
import { addDays, startOfWeek } from '@/features/meals/logic/dates';
import { ensurePlannedAhead } from '@/features/planner/bridge';
import { customRecipesRepo } from '@/features/meals/repo';
import { useCatalogFor, type Catalog } from '@/services/catalog';

import { localDate, localHour, minutesOfDay, tomorrowOf } from '../logic/day';
import { buildTodayView, type MusclesLookup, type RecipeLookup, type TodayView } from '../logic/view';
import { loadTodaySnapshot, TODAY_TABLES, type TodaySnapshot } from '../repo';

import { useDbSnapshot, useNow } from './useDbSnapshot';

export function recipeLookup(catalog: Catalog | null): RecipeLookup {
  return (id) => {
    const r = catalog?.recipeById.get(id);
    if (r) return { title: r.title, perServing: r.perServing };
    const c = customRecipesRepo.get(id);
    if (!c) return undefined;
    return {
      title: c.title,
      perServing: { kcal: c.kcal ?? 0, protein: c.protein ?? 0, carbs: c.carb ?? 0, fat: c.fat ?? 0 },
    };
  };
}

export function musclesLookup(catalog: Catalog | null): MusclesLookup {
  return (id) => catalog?.exerciseById.get(id)?.primaryMuscles ?? [];
}

/** Background planning waits this long after Today mounts, so it never competes with first taps. */
export const PLAN_DELAY_MS = 1500;

export type TodayModel = {
  status: 'loading' | 'error' | 'ready';
  view: TodayView | null;
  snapshot: TodaySnapshot | null;
  /** Recipe names are still loading (meals show skeletons). */
  catalogLoading: boolean;
  error: Error | null;
  reload: () => void;
  now: number;
};

/** Everything S11 shows, from local SQLite + the offline catalogue. Re-renders on every write. */
export function useToday(nowOverride?: number): TodayModel {
  const now = useNow(60_000, nowOverride);
  const date = localDate(now);
  const tomorrow = tomorrowOf(date);
  const weekFrom = startOfWeek(date);
  const weekTo = addDays(weekFrom, 6);
  const { data, error, reload } = useDbSnapshot(
    TODAY_TABLES,
    () => loadTodaySnapshot(date, tomorrow, weekFrom, weekTo),
    [date, tomorrow, weekFrom, weekTo],
  );
  // Only the parts Today shows: recipe names first; exercise muscles fill in when parsed.
  const recipes = useCatalogFor('recipes');
  const exercises = useCatalogFor('exercises');
  const catalog = recipes;
  const hour = localHour(now);

  // Meals are planned offline by the meals domain, the same way as on Eat: once the catalogue and
  // an onboarded profile are there, fill any missing day of this week (writes reload the snapshot).
  // Deferred past first paint and the first taps (perf audit A4), and the meal planner (which
  // converts every recipe) only runs when today or tomorrow actually has no meal plan.
  const profileStamp = data?.profile?.onboardedAt ? data.profile.updatedAt : null;
  const mealsMissing = !!data && (!data.today.mealPlan || !data.tomorrow.mealPlan);
  useEffect(() => {
    if (!catalog || profileStamp == null) return;
    const id = setTimeout(() => {
      try {
        // Training for this week (no-op when planned), then any missing meal days.
        ensurePlannedAhead(Date.now());
        if (mealsMissing) ensureWeekMeals(date, Date.now());
      } catch {
        // planning is best effort; Today still shows what is stored
      }
    }, PLAN_DELAY_MS);
    return () => clearTimeout(id);
  }, [catalog, date, profileStamp, mealsMissing]);
  const minutes = minutesOfDay(now);

  const view = useMemo(
    () =>
      data
        ? buildTodayView(data, { recipe: recipeLookup(recipes), muscles: musclesLookup(exercises) }, minutes, hour)
        : null,
    [data, recipes, exercises, minutes, hour],
  );

  const needsCatalog = (data?.today.meals.length ?? 0) > 0 || data?.today.session !== undefined;
  return {
    status: error ? 'error' : view ? 'ready' : 'loading',
    view,
    snapshot: data,
    catalogLoading: needsCatalog && recipes === null,
    error,
    reload,
    now,
  };
}
