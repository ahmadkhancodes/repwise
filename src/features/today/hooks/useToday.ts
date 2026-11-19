import { useEffect, useMemo } from 'react';

import { ensureWeekMeals } from '@/features/meals';
import { ensurePlannedAhead } from '@/features/planner/bridge';
import { customRecipesRepo } from '@/features/meals/repo';
import { useCatalog, type Catalog } from '@/services/catalog';

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
  const { data, error, reload } = useDbSnapshot(
    TODAY_TABLES,
    () => loadTodaySnapshot(date, tomorrow),
    [date, tomorrow],
  );
  const catalog = useCatalog();
  const hour = localHour(now);

  // Meals are planned offline by the meals domain, the same way as on Eat: once the catalogue and
  // an onboarded profile are there, fill any missing day of this week (writes reload the snapshot).
  const profileStamp = data?.profile?.onboardedAt ? data.profile.updatedAt : null;
  useEffect(() => {
    if (!catalog || profileStamp == null) return;
    const id = setTimeout(() => {
      try {
        // Training + meals for this week (no-op when planned), then any missing meal days.
        ensurePlannedAhead(Date.now());
        ensureWeekMeals(date, Date.now());
      } catch {
        // planning is best effort; Today still shows what is stored
      }
    }, 0);
    return () => clearTimeout(id);
  }, [catalog, date, profileStamp]);
  const minutes = minutesOfDay(now);

  const view = useMemo(
    () =>
      data
        ? buildTodayView(data, { recipe: recipeLookup(catalog), muscles: musclesLookup(catalog) }, minutes, hour)
        : null,
    [data, catalog, minutes, hour],
  );

  const needsCatalog = (data?.today.meals.length ?? 0) > 0 || data?.today.session !== undefined;
  return {
    status: error ? 'error' : view ? 'ready' : 'loading',
    view,
    snapshot: data,
    catalogLoading: needsCatalog && catalog === null,
    error,
    reload,
    now,
  };
}
