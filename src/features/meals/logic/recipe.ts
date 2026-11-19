/** S24 recipe detail maths: scaled ingredients and macros (engine totals). Pure. */
import type { Food, Recipe } from '@repwise/content';
import { totalsFor, type Totals } from '@repwise/engine';

export const SERVING_STEP = 0.25;
export const SERVING_MIN = 0.25;
export const SERVING_MAX = 8;

export type ScaledIngredient = { foodId: string; name: string; grams: number; note?: string };

/** Ingredients for `servings` portions (content grams are for the whole recipe). */
export function scaledIngredients(
  r: Recipe,
  servings: number,
  foodById: ReadonlyMap<string, Food>,
): ScaledIngredient[] {
  return r.ingredients.map((ing) => ({
    foodId: ing.foodId,
    name: foodById.get(ing.foodId)?.name ?? ing.foodId,
    grams: (ing.grams / r.servings) * servings,
    ...(ing.note ? { note: ing.note } : {}),
  }));
}

/** Macros for `servings` portions, via the engine's totals (rounded to 0.1). */
export function macrosFor(r: Pick<Recipe, 'perServing'>, servings: number): Totals {
  return totalsFor([{ perServing: r.perServing, min: 0, max: 99 }], [servings]);
}

/** Kitchen-friendly grams: under 10 g to the nearest half gram, otherwise whole grams. */
export function formatGrams(g: number): string {
  if (g < 10) return `${Math.round(g * 2) / 2} g`;
  return `${Math.round(g)} g`;
}

/** "1", "1.5", "0.75" — no trailing zeros. */
export function formatServings(s: number): string {
  return String(Math.round(s * 100) / 100);
}

export function totalMinutes(r: Pick<Recipe, 'prepMin' | 'cookMin'>): number {
  return r.prepMin + r.cookMin;
}

export const COST_LABEL: Record<1 | 2 | 3, string> = { 1: 'Budget', 2: 'Mid', 3: 'Premium' };

const CUISINE_LABEL: Record<string, string> = {
  middle_eastern: 'Middle Eastern',
  north_african: 'North African',
  east_asian: 'East Asian',
  southeast_asian: 'Southeast Asian',
  global: 'Global',
};

export function cuisineLabel(c: string): string {
  return CUISINE_LABEL[c] ?? c.charAt(0).toUpperCase() + c.slice(1);
}

const TAG_LABEL: Record<string, string> = {
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  pescatarian: 'Pescatarian',
  halal_friendly: 'Halal-friendly',
  high_protein: 'High protein',
  low_carb: 'Low carb',
  gluten_free: 'Gluten-free',
  dairy_free: 'Dairy-free',
};

export function dietTagLabel(t: string): string {
  return TAG_LABEL[t] ?? t;
}
