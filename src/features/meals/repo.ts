import { asc, desc, eq } from 'drizzle-orm';

import { createRepo, type Row } from '@/db/repo';
import { mealPlans, meals, recipes, type MealStatus } from '@/db/schema';

export const mealPlansRepo = createRepo(mealPlans, 'meal_plans');
export const mealsRepo = createRepo(meals, 'meals');
/** User-created recipes (the catalogue is @repwise/content via src/services/catalog.ts). */
export const customRecipesRepo = createRepo(recipes, 'recipes');
export type MealPlan = Row<typeof mealPlans>;
export type Meal = Row<typeof meals>;
export type CustomRecipe = Row<typeof recipes>;

export const SLOT_ORDER = ['breakfast', 'lunch', 'snack', 'dinner'] as const;

export function sortBySlot<T extends { slot: string }>(rows: T[]): T[] {
  const rank = (s: string) => {
    const i = (SLOT_ORDER as readonly string[]).indexOf(s);
    return i === -1 ? SLOT_ORDER.length : i;
  };
  return [...rows].sort((a, b) => rank(a.slot) - rank(b.slot));
}

export function mealPlanForDate(date: string): MealPlan | undefined {
  return mealPlansRepo.first(eq(mealPlans.date, date), desc(mealPlans.updatedAt));
}

export function mealsForPlan(mealPlanId: string): Meal[] {
  return sortBySlot(mealsRepo.list(eq(meals.mealPlanId, mealPlanId)));
}

/** Tick / skip a planned meal (S21 core action). */
export function setMealStatus(id: string, status: MealStatus, now: number = Date.now()): Meal | undefined {
  return mealsRepo.update(id, { status, eatenAt: status === 'eaten' ? now : null }, now);
}

/** Swap: the meal keeps its slot; the old recipe id is remembered in swapped_from. */
export function swapMeal(
  id: string,
  recipeId: string,
  now: number = Date.now(),
  portion?: number,
): Meal | undefined {
  const m = mealsRepo.get(id);
  if (!m) return undefined;
  return mealsRepo.update(
    id,
    {
      recipeId,
      swappedFrom: m.recipeId,
      status: 'planned',
      eatenAt: null,
      ...(portion !== undefined ? { portion } : {}),
    },
    now,
  );
}

export function useMealPlan(date: string): MealPlan | undefined {
  return mealPlansRepo.useLive(eq(mealPlans.date, date), desc(mealPlans.updatedAt), [date]).data[0];
}

export function useMeals(mealPlanId: string): Meal[] {
  return sortBySlot(mealsRepo.useLive(eq(meals.mealPlanId, mealPlanId), asc(meals.createdAt), [mealPlanId]).data);
}
