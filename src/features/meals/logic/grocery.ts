/**
 * RW-36 grocery list: the week's planned meals → merged ingredient quantities grouped by aisle.
 * Pure. Ingredient grams in content are for the whole recipe, so per serving = grams / servings,
 * times the planned portion. Skipped meals are left out.
 */
import type { Food, Recipe } from '@repwise/content';

export type GroceryMeal = { recipeId: string | null; portion: number; status: string };

export type GroceryItem = { foodId: string; name: string; grams: number; aisle: string };
export type GroceryAisle = { aisle: string; label: string; items: GroceryItem[] };

/** Store walk order (sheet 11 "grouped by aisle"). */
export const AISLES: { key: string; label: string }[] = [
  { key: 'vegetables', label: 'Vegetables' },
  { key: 'fruit', label: 'Fruit' },
  { key: 'herbs_spices', label: 'Herbs & spices' },
  { key: 'poultry', label: 'Poultry' },
  { key: 'meat', label: 'Meat' },
  { key: 'seafood', label: 'Fish & seafood' },
  { key: 'eggs', label: 'Eggs' },
  { key: 'dairy', label: 'Dairy' },
  { key: 'plant_protein', label: 'Tofu & plant protein' },
  { key: 'legumes', label: 'Beans & lentils' },
  { key: 'grains', label: 'Rice & grains' },
  { key: 'bread_pasta', label: 'Bread & pasta' },
  { key: 'nuts_seeds', label: 'Nuts & seeds' },
  { key: 'fats', label: 'Oils & fats' },
  { key: 'condiments', label: 'Sauces & condiments' },
  { key: 'sweeteners', label: 'Baking & sweeteners' },
];

const aisleRank = (k: string) => {
  const i = AISLES.findIndex((a) => a.key === k);
  return i === -1 ? AISLES.length : i;
};

export function buildGroceryList(
  meals: readonly GroceryMeal[],
  recipeById: ReadonlyMap<string, Recipe>,
  foodById: ReadonlyMap<string, Food>,
): GroceryAisle[] {
  const merged = new Map<string, GroceryItem>();
  for (const m of meals) {
    if (m.status === 'skipped' || !m.recipeId) continue;
    const r = recipeById.get(m.recipeId);
    if (!r) continue;
    for (const ing of r.ingredients) {
      const grams = (ing.grams / r.servings) * m.portion;
      const f = foodById.get(ing.foodId);
      const prev = merged.get(ing.foodId);
      if (prev) prev.grams += grams;
      else
        merged.set(ing.foodId, {
          foodId: ing.foodId,
          name: f?.name ?? ing.foodId,
          grams,
          aisle: f?.category ?? 'other',
        });
    }
  }
  const byAisle = new Map<string, GroceryItem[]>();
  for (const it of merged.values()) {
    const list = byAisle.get(it.aisle) ?? [];
    list.push(it);
    byAisle.set(it.aisle, list);
  }
  return [...byAisle.entries()]
    .sort(([a], [b]) => aisleRank(a) - aisleRank(b) || a.localeCompare(b))
    .map(([aisle, items]) => ({
      aisle,
      label: AISLES.find((a) => a.key === aisle)?.label ?? 'Other',
      items: items.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

/**
 * Shopping quantity, rounded UP so the user never buys too little: grams to 5 g (< 1 kg), kg to
 * 0.1; imperial: oz to 0.5 (< 1 lb), lb to 0.1. Spices under 5 g read "a pinch".
 */
export function formatQty(grams: number, units: 'metric' | 'imperial' = 'metric'): string {
  if (grams < 5) return grams < 1 ? 'a pinch' : `${Math.ceil(grams)} g`;
  if (units === 'imperial') {
    const oz = grams / 28.349523125;
    if (oz < 16) return `${Math.ceil(oz * 2) / 2} oz`;
    return `${(Math.ceil((oz / 16) * 10) / 10).toFixed(1)} lb`;
  }
  if (grams < 1000) return `${Math.ceil(grams / 5) * 5} g`;
  return `${(Math.ceil(grams / 100) / 10).toFixed(1)} kg`;
}

export function groceryCount(list: readonly GroceryAisle[]): number {
  return list.reduce((n, a) => n + a.items.length, 0);
}

/** Plain-text list for the share sheet (unticked items only, aisle headings). */
export function groceryText(
  list: readonly GroceryAisle[],
  checked: ReadonlySet<string>,
  heading: string,
  units: 'metric' | 'imperial' = 'metric',
): string {
  const lines = [heading];
  for (const a of list) {
    const open = a.items.filter((i) => !checked.has(i.foodId));
    if (open.length === 0) continue;
    lines.push('', a.label);
    for (const i of open) lines.push(`• ${i.name} — ${formatQty(i.grams, units)}`);
  }
  if (lines.length === 1) lines.push('', 'All done. Everything is ticked off.');
  return lines.join('\n');
}
