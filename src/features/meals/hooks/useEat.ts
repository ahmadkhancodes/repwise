/**
 * Live view models for the Eat screens. SQLite live queries re-render on every local write, so a
 * tick, swap or log shows up instantly. The offline planner fills missing days in the background
 * (after the first paint), never blocking the UI.
 */
import { mealFromRecipe, type ISODate } from '@repwise/engine';
import { asc, inArray } from 'drizzle-orm';
import { useEffect, useMemo, useState } from 'react';

import { mealPlans, meals as mealsTable } from '@/db/schema';
import { dayIntake } from '@/features/nutrition/logic/intake';
import { totalWaterMl } from '@/features/nutrition/logic/water';
import { useFoodLogs, type DayTotals, type FoodLog } from '@/features/nutrition/repo';
import { useProfile } from '@/features/settings/repo';
import { useCatalog, type Catalog, type Recipe } from '@/services/catalog';

import { addDays, startOfWeek, weekDates } from '../logic/dates';
import { toMealProfile, type MealProfile } from '../logic/profile';
import { macrosFor } from '../logic/recipe';
import { isMealSlot } from '../logic/plan';
import { slotTime } from '../logic/slots';
import { mealPlansRepo, mealsRepo, sortBySlot, type Meal, type MealPlan } from '../repo';
import { ensureWeekMeals, engineRecipe } from '../service';

export type PlanState = 'loading' | 'no_profile' | 'ready' | 'error';

export type MealView = {
  id: string;
  slot: string;
  status: Meal['status'];
  portion: number;
  recipeId: string | null;
  recipe: Recipe | undefined;
  title: string;
  time: string | undefined;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type Targets = { kcal: number; protein: number; carbs: number; fat: number };

export function toMealView(m: Meal, cat: Catalog | null, mealTimes: readonly string[]): MealView {
  const recipe = m.recipeId ? cat?.recipeById.get(m.recipeId) : undefined;
  const eng = engineRecipe(m.recipeId);
  const macros =
    eng && isMealSlot(m.slot)
      ? mealFromRecipe(eng, m.slot, m.portion)
      : recipe
        ? { ...macrosFor(recipe, m.portion), kcal: Math.round(macrosFor(recipe, m.portion).kcal) }
        : { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  return {
    id: m.id,
    slot: m.slot,
    status: m.status,
    portion: m.portion,
    recipeId: m.recipeId,
    recipe,
    title: recipe?.title ?? 'Meal',
    time: slotTime(m.slot, mealTimes),
    kcal: Math.round(macros.kcal),
    protein: macros.protein,
    carbs: macros.carbs,
    fat: macros.fat,
  };
}

export function planTargets(plan: MealPlan | undefined): Targets | null {
  if (!plan || plan.kcalTarget == null) return null;
  return {
    kcal: plan.kcalTarget,
    protein: plan.macros?.protein ?? 0,
    carbs: plan.macros?.carbs ?? 0,
    fat: plan.macros?.fat ?? 0,
  };
}

/** Runs the offline planner for the week of `date` once the catalogue and profile are ready. */
export function useEnsureWeek(date: ISODate, profile: MealProfile | null, cat: Catalog | null, profileStamp: number | undefined) {
  const [attempt, setAttempt] = useState(0);
  const [done, setDone] = useState<{ key: string; state: PlanState } | null>(null);
  const week = startOfWeek(date);
  // profileStamp: re-run after the profile changes (diet, allergies, targets).
  const key = `${week}|${profileStamp ?? 0}|${attempt}`;
  const ready = Boolean(cat && profile);
  useEffect(() => {
    if (!ready) return;
    let live = true;
    // Next tick, so the skeleton paints before the engine runs.
    const id = setTimeout(() => {
      let state: PlanState;
      try {
        state = ensureWeekMeals(week).status === 'no_profile' ? 'no_profile' : 'ready';
      } catch {
        state = 'error';
      }
      if (live) setDone({ key, state });
    }, 0);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [ready, week, key]);
  const state: PlanState = !cat ? 'loading' : !profile ? 'no_profile' : done?.key === key ? done.state : 'loading';
  return { state, retry: () => setAttempt((n) => n + 1) };
}

export type EatDay = {
  state: PlanState;
  retry: () => void;
  profile: MealProfile | null;
  catalog: Catalog | null;
  plan: MealPlan | undefined;
  meals: MealView[];
  logs: FoodLog[];
  targets: Targets | null;
  intake: DayTotals;
  waterMl: number;
};

export function useEatDay(date: ISODate): EatDay {
  const row = useProfile();
  const profile = useMemo(() => toMealProfile(row), [row]);
  const cat = useCatalog();
  const { state, retry } = useEnsureWeek(date, profile, cat, row?.updatedAt);
  const planRows = mealPlansRepo.useLive(inArray(mealPlans.date, [date]), asc(mealPlans.updatedAt), [date]).data;
  const plan = planRows[planRows.length - 1];
  const mealRows = mealsRepo.useLive(inArray(mealsTable.mealPlanId, [plan?.id ?? '']), asc(mealsTable.createdAt), [plan?.id]).data;
  const logs = useFoodLogs(date);
  const meals = useMemo(
    () => sortBySlot(mealRows).map((m) => toMealView(m, cat, profile?.mealTimes ?? [])),
    [mealRows, cat, profile],
  );
  const intake = useMemo(() => dayIntake(logs, meals), [logs, meals]);
  return {
    state,
    retry,
    profile,
    catalog: cat,
    plan,
    meals,
    logs,
    targets: planTargets(plan),
    intake,
    waterMl: totalWaterMl(logs),
  };
}

export type WeekDaySummary = {
  date: ISODate;
  plan: MealPlan | undefined;
  meals: MealView[];
  kcal: number;
  target: number | null;
  eaten: number;
};

export function useEatWeek(anyDate: ISODate) {
  const row = useProfile();
  const profile = useMemo(() => toMealProfile(row), [row]);
  const cat = useCatalog();
  const weekStart = startOfWeek(anyDate);
  const dates = useMemo(() => weekDates(weekStart), [weekStart]);
  const { state, retry } = useEnsureWeek(weekStart, profile, cat, row?.updatedAt);
  const plans = mealPlansRepo.useLive(inArray(mealPlans.date, dates), asc(mealPlans.updatedAt), [weekStart]).data;
  const latest = useMemo(() => {
    const m = new Map<string, MealPlan>();
    for (const p of plans) m.set(p.date, p);
    return m;
  }, [plans]);
  const ids = [...latest.values()].map((p) => p.id);
  const mealRows = mealsRepo.useLive(inArray(mealsTable.mealPlanId, ids.length ? ids : ['']), asc(mealsTable.createdAt), [ids.join(',')]).data;
  const days: WeekDaySummary[] = useMemo(
    () =>
      dates.map((date) => {
        const plan = latest.get(date);
        const meals = sortBySlot(mealRows.filter((m) => m.mealPlanId === plan?.id)).map((m) =>
          toMealView(m, cat, profile?.mealTimes ?? []),
        );
        return {
          date,
          plan,
          meals,
          kcal: meals.reduce((t, m) => t + m.kcal, 0),
          target: plan?.kcalTarget ?? null,
          eaten: meals.filter((m) => m.status === 'eaten').length,
        };
      }),
    [dates, latest, mealRows, cat, profile],
  );
  return { state, retry, profile, catalog: cat, weekStart, nextWeek: addDays(weekStart, 7), days };
}
