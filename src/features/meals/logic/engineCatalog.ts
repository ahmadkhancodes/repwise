/**
 * Content recipes (@repwise/content) → the engine's Recipe shape, and the hard safety pre-filter.
 *
 * The integration branch is adding the same adapter to @repwise/content (`toEngine.ts`) and widening
 * the engine enums (D26). Until that lands, this module maps every content value onto whatever the
 * installed engine accepts, checked at runtime, so it keeps working before AND after that merge:
 * a value the engine knows passes through; otherwise a fixed fallback is used. Nothing is invented:
 * macros, allergens, tags and protein source come from the content build.
 *
 * Safety never depends on the mapping: `safeRecipes` filters allergens (EU-14 names) and diet on the
 * content data first, and the engine filters again.
 */
import type { Food, Recipe } from '@repwise/content';
import {
  ALLERGENS,
  CUISINES,
  PROTEIN_SOURCES,
  type DietType,
  type Recipe as EngineRecipe,
} from '@repwise/engine';

import { CONTENT_TO_ENGINE_ALLERGEN, allergenHits, type ContentAllergen } from './allergens';

const has = (list: readonly string[], v: string) => list.includes(v);

/** Content cuisine groups → older engine cuisines (used only when the engine lacks the group). */
const CUISINE_FALLBACK: Record<string, string> = {
  middle_eastern: 'arab',
  gulf: 'arab',
  north_african: 'arab',
  east_asian: 'chinese',
  southeast_asian: 'thai',
  global: 'other',
};

export function toEngineCuisine(c: string): EngineRecipe['cuisine'] {
  const v = has(CUISINES, c) ? c : (CUISINE_FALLBACK[c] ?? 'other');
  return v as EngineRecipe['cuisine'];
}

const PROTEIN_FALLBACK: Record<string, string> = {
  eggs: 'egg',
  other: 'none',
  pork: 'mixed',
  soy: 'tofu',
  nuts_seeds: 'none',
  grains: 'none',
};

export function toEngineProtein(p: string): EngineRecipe['proteinSource'] {
  if (p === 'eggs') return 'egg';
  if (p === 'other') return 'none';
  const v = has(PROTEIN_SOURCES, p) ? p : (PROTEIN_FALLBACK[p] ?? 'none');
  return v as EngineRecipe['proteinSource'];
}

export function toEngineAllergens(list: readonly ContentAllergen[]): EngineRecipe['allergens'] {
  const out = new Set<string>();
  for (const a of list) {
    const e = CONTENT_TO_ENGINE_ALLERGEN[a];
    if (has(ALLERGENS, e)) out.add(e);
  }
  return [...out] as EngineRecipe['allergens'];
}

/** Keto = low carb, ≤ 10 g net carbs and ≥ 60% of energy from fat (same rule as content toEngine). */
export function isKeto(r: Pick<Recipe, 'perServing' | 'dietTags'>): boolean {
  const { kcal, carbs, fibre, fat } = r.perServing;
  return (
    r.dietTags.includes('low_carb') && carbs - fibre <= 10 && kcal > 0 && (9 * fat) / kcal >= 0.6
  );
}

/** Does the recipe suit the diet? (content tags mean "suitable for"). */
export function dietSuitable(r: Pick<Recipe, 'dietTags' | 'perServing'>, diet: DietType): boolean {
  switch (diet) {
    case 'halal':
      return r.dietTags.includes('halal_friendly');
    case 'vegetarian':
      return r.dietTags.includes('vegetarian') || r.dietTags.includes('vegan');
    case 'vegan':
      return r.dietTags.includes('vegan');
    case 'pescatarian':
      return ['pescatarian', 'vegetarian', 'vegan'].some((t) => r.dietTags.includes(t as never));
    case 'keto':
      return isKeto(r);
    default:
      return true;
  }
}

export function recipeToEngine(r: Recipe, foodById: ReadonlyMap<string, Food>): EngineRecipe {
  const tags = new Set<string>(r.dietTags.map((t) => (t === 'halal_friendly' ? 'halal' : t)));
  if (isKeto(r)) tags.add('keto');
  return {
    id: r.id,
    name: r.title,
    cuisine: toEngineCuisine(r.cuisine),
    slots: [...r.slots],
    dietTags: [...tags] as EngineRecipe['dietTags'],
    allergens: toEngineAllergens(r.allergens),
    proteinSource: toEngineProtein(r.mainProtein),
    ingredients: r.ingredients.map((ing) => {
      const f = foodById.get(ing.foodId);
      return {
        id: ing.foodId,
        name: f?.name ?? ing.foodId,
        grams: ing.grams / r.servings,
        ...(f ? { fdcId: f.source.fdcId, aisle: f.category } : {}),
      };
    }),
    perServing: { ...r.perServing },
    prepMin: r.prepMin + r.cookMin,
    costTier: r.costTier,
    scalable: { ...r.scalable },
    steps: [...r.steps],
    imageId: r.mediaId,
  };
}

export type SafetyRules = {
  allergies: readonly ContentAllergen[];
  dietType: DietType;
  neverShow?: ReadonlySet<string>;
};

/** Hard rules on the content data (allergens in EU-14 names, diet, never-show). Never relaxed. */
export function recipeAllowed(r: Recipe, rules: SafetyRules): boolean {
  return (
    allergenHits(r, rules.allergies).length === 0 &&
    dietSuitable(r, rules.dietType) &&
    !(rules.neverShow?.has(r.id) ?? false)
  );
}

/** Safe content recipes converted for the engine. */
export function engineRecipes(
  recipes: readonly Recipe[],
  foodById: ReadonlyMap<string, Food>,
  rules: SafetyRules,
): EngineRecipe[] {
  return recipes.filter((r) => recipeAllowed(r, rules)).map((r) => recipeToEngine(r, foodById));
}
