/**
 * Pure, deterministic derivations for recipes. Nutrition, allergens, diet tags and
 * the main protein source are ALWAYS computed from foods.json — never typed by hand.
 */
import { ALLERGENS } from './enums';
import type {
  Allergen,
  DietTag,
  Food,
  FoodOrigin,
  Macros,
  MealSlot,
  ProteinSource,
  RecipeIngredient,
} from './schemas';

export interface RecipeInput {
  servings: number;
  slots: MealSlot[];
  ingredients: RecipeIngredient[];
}

export interface RecipeDerived {
  perServing: Macros;
  allergens: Allergen[];
  dietTags: DietTag[];
  mainProtein: ProteinSource;
}

/** Thresholds used to derive the nutrition-based diet tags (per serving). */
export const TAG_RULES = {
  highProtein: { minGrams: 25, minGramsSnack: 15, minEnergyShare: 0.25 },
  lowCarb: { maxGrams: 25, maxEnergyShare: 0.2 },
} as const;

const VEGETARIAN_ORIGINS: ReadonlySet<FoodOrigin> = new Set(['plant', 'dairy', 'egg', 'honey']);
const PESCATARIAN_ORIGINS: ReadonlySet<FoodOrigin> = new Set([...VEGETARIAN_ORIGINS, 'fish', 'shellfish']);

const round1 = (n: number): number => Math.round(n * 10) / 10;

export type FoodIndex = ReadonlyMap<string, Food>;

export function indexFoods(foods: readonly Food[]): FoodIndex {
  return new Map(foods.map((f) => [f.id, f]));
}

function food(index: FoodIndex, id: string): Food {
  const f = index.get(id);
  if (!f) throw new Error(`Unknown food id "${id}"`);
  return f;
}

/** Whole-recipe totals (unrounded). */
export function recipeTotals(ingredients: readonly RecipeIngredient[], index: FoodIndex): Macros {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 };
  for (const ing of ingredients) {
    const p = food(index, ing.foodId).per100g;
    const k = ing.grams / 100;
    t.kcal += p.kcal * k;
    t.protein += p.protein * k;
    t.carbs += p.carbs * k;
    t.fat += p.fat * k;
    t.fibre += p.fibre * k;
  }
  return t;
}

export function perServing(ingredients: readonly RecipeIngredient[], servings: number, index: FoodIndex): Macros {
  const t = recipeTotals(ingredients, index);
  return {
    kcal: Math.round(t.kcal / servings),
    protein: round1(t.protein / servings),
    carbs: round1(t.carbs / servings),
    fat: round1(t.fat / servings),
    fibre: round1(t.fibre / servings),
  };
}

/** Union of ingredient allergens, in the canonical EU-14 order. */
export function recipeAllergens(ingredients: readonly RecipeIngredient[], index: FoodIndex): Allergen[] {
  const set = new Set<Allergen>();
  for (const ing of ingredients) for (const a of food(index, ing.foodId).allergens) set.add(a);
  return ALLERGENS.filter((a) => set.has(a));
}

/** Energy from macros using general Atwater factors (4/4/9). */
export function atwaterKcal(m: Pick<Macros, 'protein' | 'carbs' | 'fat'>): number {
  return 4 * m.protein + 4 * m.carbs + 9 * m.fat;
}

export function dietTags(r: RecipeInput, macros: Macros, allergens: readonly Allergen[], index: FoodIndex): DietTag[] {
  const origins = r.ingredients.map((i) => food(index, i.foodId).origin);
  const energy = atwaterKcal(macros) || 1;
  const snackOnly = r.slots.every((s) => s === 'snack');
  const tags: DietTag[] = [];
  if (origins.every((o) => VEGETARIAN_ORIGINS.has(o))) tags.push('vegetarian');
  if (origins.every((o) => o === 'plant')) tags.push('vegan');
  if (origins.every((o) => PESCATARIAN_ORIGINS.has(o))) tags.push('pescatarian');
  if (!origins.includes('pork')) tags.push('halal_friendly');
  const hp = TAG_RULES.highProtein;
  if (
    macros.protein >= (snackOnly ? hp.minGramsSnack : hp.minGrams) &&
    (4 * macros.protein) / energy >= hp.minEnergyShare
  ) {
    tags.push('high_protein');
  }
  const lc = TAG_RULES.lowCarb;
  if (macros.carbs <= lc.maxGrams && (4 * macros.carbs) / energy <= lc.maxEnergyShare) tags.push('low_carb');
  if (!allergens.includes('gluten')) tags.push('gluten_free');
  if (!allergens.includes('milk')) tags.push('dairy_free');
  return tags;
}

/** Protein-source family of a single food, used for the "no same protein twice a day" rule. */
export function proteinSourceOf(f: Food): ProteinSource {
  if (f.origin === 'pork') return 'pork';
  if (f.origin === 'shellfish') return 'shellfish';
  if (f.origin === 'fish') return 'fish';
  if (f.origin === 'egg') return 'eggs';
  if (f.origin === 'dairy') return 'dairy';
  if (f.origin === 'poultry') return f.id.startsWith('turkey') ? 'turkey' : 'chicken';
  if (f.origin === 'meat') {
    if (f.id.startsWith('lamb')) return 'lamb';
    if (f.id.startsWith('goat')) return 'goat';
    return 'beef';
  }
  if ((f.category === 'legumes' || f.category === 'plant_protein') && f.allergens.includes('soybeans')) return 'soy';
  if (f.category === 'legumes' || f.category === 'plant_protein') return 'legumes';
  if (f.category === 'nuts_seeds') return 'nuts_seeds';
  if (f.category === 'grains' || f.category === 'bread_pasta') return 'grains';
  return 'other';
}

/** The ingredient contributing the most protein decides the recipe's main protein source. */
export function mainProtein(ingredients: readonly RecipeIngredient[], index: FoodIndex): ProteinSource {
  let best: { grams: number; food: Food } | undefined;
  for (const ing of ingredients) {
    const f = food(index, ing.foodId);
    const grams = (f.per100g.protein * ing.grams) / 100;
    if (!best || grams > best.grams) best = { grams, food: f };
  }
  return best ? proteinSourceOf(best.food) : 'other';
}

export function deriveRecipe(r: RecipeInput, index: FoodIndex): RecipeDerived {
  const macros = perServing(r.ingredients, r.servings, index);
  const allergens = recipeAllergens(r.ingredients, index);
  return {
    perServing: macros,
    allergens,
    dietTags: dietTags(r, macros, allergens, index),
    mainProtein: mainProtein(r.ingredients, index),
  };
}
