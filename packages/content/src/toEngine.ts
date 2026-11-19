/**
 * Adapter: content catalogues → `@repwise/engine` catalogue schemas (decisions D26–D28).
 *
 * The content package and the engine were built in parallel, so some fields and enums differ.
 * Rules:
 * - Where the two vocabularies only differed in coverage, the ENGINE enums were extended (D26):
 *   pattern `mobility`, muscle `hip_flexors`, 18 equipment values, allergens celery / lupin /
 *   mustard / sulphites, 6 cuisine groups, protein sources pork / soy / nuts_seeds / grains.
 *   Those values pass through unchanged.
 * - Where they differed only in spelling, the maps below translate them (one value → one value),
 *   except crustaceans + molluscs → shellfish (the engine's single shellfish allergen; stricter, never looser).
 * - Content-only fields the planner does not use are not carried (the library UI reads them from
 *   `@repwise/content` directly): exercise `pattern` detail, `patternFamily` (it becomes the engine
 *   pattern), `commonMistakes`, `alternatives`; recipe `servings` (folded into per-serving grams),
 *   ingredient `note`, recipe `source` / `licence`.
 * - Nothing is invented: macros, allergens, diet tags and protein source come from the content
 *   build (computed from USDA foods). The only derived value is the `keto` tag, computed here from
 *   the computed per-serving macros (KETO_RULE).
 * - An item that cannot satisfy the engine contract is excluded with a reason (`excluded`); the
 *   content test pins that list. Today: cardio exercises without a MET value (D28).
 *
 * Only type imports from the engine: this module has no runtime dependency on it.
 */
import type {
  Allergen as EngineAllergen,
  Cuisine as EngineCuisine,
  DietTag as EngineDietTag,
  Equipment as EngineEquipment,
  Exercise as EngineExercise,
  Pattern as EnginePattern,
  ProteinSource as EngineProteinSource,
  Recipe as EngineRecipe,
} from '@repwise/engine';
import { exercises as allExercises, foods as allFoods, recipes as allRecipes } from './data';
import { indexFoods, type FoodIndex } from './compute';
import {
  PATTERNS,
  type Allergen,
  type Cuisine,
  type DietTag,
  type Equipment,
  type Exercise,
  type Food,
  type Level,
  type PatternFamily,
  type ProteinSource,
  type Recipe,
} from './schemas';

export type { EngineExercise, EngineRecipe };

/* ------------------------------------------------------------------ */
/* Mapping tables (exhaustive: a new content value fails typecheck)    */
/* ------------------------------------------------------------------ */

/** Coarse family → engine pattern (identical vocabularies after D26). */
export const PATTERN_TO_ENGINE: Record<PatternFamily, EnginePattern> = {
  squat: 'squat',
  hinge: 'hinge',
  lunge: 'lunge',
  push_h: 'push_h',
  push_v: 'push_v',
  pull_h: 'pull_h',
  pull_v: 'pull_v',
  carry: 'carry',
  core: 'core',
  isolation: 'isolation',
  cardio: 'cardio',
  mobility: 'mobility',
};

export const LEVEL_TO_ENGINE: Record<Level, 1 | 2 | 3> = { beginner: 1, intermediate: 2, advanced: 3 };

/** Two spelling renames; every other value is identical in both vocabularies. */
export const EQUIPMENT_TO_ENGINE: Record<Equipment, EngineEquipment> = {
  bodyweight: 'bodyweight',
  dumbbell: 'dumbbell',
  barbell: 'barbell',
  ez_bar: 'ez_bar',
  trap_bar: 'trap_bar',
  kettlebell: 'kettlebell',
  cable: 'cable',
  machine: 'machine',
  smith_machine: 'smith',
  band: 'band',
  bench: 'bench',
  squat_rack: 'squat_rack',
  pull_up_bar: 'pullup_bar',
  dip_station: 'dip_station',
  landmine: 'landmine',
  box: 'box',
  medicine_ball: 'medicine_ball',
  suspension_trainer: 'suspension_trainer',
  ab_wheel: 'ab_wheel',
  stability_ball: 'stability_ball',
  weight_plate: 'weight_plate',
  sled: 'sled',
  jump_rope: 'jump_rope',
  treadmill: 'treadmill',
  bike: 'bike',
  rower: 'rower',
  elliptical: 'elliptical',
  stair_climber: 'stair_climber',
  foam_roller: 'foam_roller',
  mat: 'mat',
};

/** EU-14 names → engine names. Both shellfish groups map to the engine's single `shellfish`. */
export const ALLERGEN_TO_ENGINE: Record<Allergen, EngineAllergen> = {
  celery: 'celery',
  gluten: 'gluten',
  crustaceans: 'shellfish',
  eggs: 'egg',
  fish: 'fish',
  lupin: 'lupin',
  milk: 'dairy',
  molluscs: 'shellfish',
  mustard: 'mustard',
  nuts: 'nuts',
  peanuts: 'peanut',
  sesame: 'sesame',
  soybeans: 'soy',
  sulphites: 'sulphites',
};

/** Identical after D26 (the engine gained the content groups; preferences match across both via cuisineMatches). */
export const CUISINE_TO_ENGINE: Record<Cuisine, EngineCuisine> = {
  american: 'american',
  british: 'british',
  mediterranean: 'mediterranean',
  italian: 'italian',
  middle_eastern: 'middle_eastern',
  gulf: 'gulf',
  north_african: 'north_african',
  pakistani: 'pakistani',
  indian: 'indian',
  east_asian: 'east_asian',
  southeast_asian: 'southeast_asian',
  mexican: 'mexican',
  global: 'global',
};

/**
 * `halal_friendly` (no pork or alcohol; meat bought halal) is what the engine's `halal` tag means:
 * the profile diet `halal` requires it. Everything else is identical.
 */
export const DIET_TAG_TO_ENGINE: Record<DietTag, EngineDietTag> = {
  vegetarian: 'vegetarian',
  vegan: 'vegan',
  pescatarian: 'pescatarian',
  halal_friendly: 'halal',
  high_protein: 'high_protein',
  low_carb: 'low_carb',
  gluten_free: 'gluten_free',
  dairy_free: 'dairy_free',
};

/** `eggs` → `egg`; `other` (no protein food leads) → `none`, exempt from the once-a-day rule. */
export const PROTEIN_TO_ENGINE: Record<ProteinSource, EngineProteinSource> = {
  chicken: 'chicken',
  turkey: 'turkey',
  beef: 'beef',
  lamb: 'lamb',
  goat: 'goat',
  pork: 'pork',
  fish: 'fish',
  shellfish: 'shellfish',
  eggs: 'egg',
  dairy: 'dairy',
  legumes: 'legumes',
  soy: 'soy',
  nuts_seeds: 'nuts_seeds',
  grains: 'grains',
  other: 'none',
};

/**
 * `keto` is derived from the computed per-serving macros (the content build has no keto tag):
 * low_carb, at most 10 g net carbs and at least 60% of energy from fat.
 */
export const KETO_RULE = { maxNetCarbs: 10, minFatEnergyShare: 0.6 } as const;

export function isKeto(r: Pick<Recipe, 'perServing' | 'dietTags'>): boolean {
  const { kcal, carbs, fibre, fat } = r.perServing;
  return r.dietTags.includes('low_carb') && carbs - fibre <= KETO_RULE.maxNetCarbs && kcal > 0 && (9 * fat) / kcal >= KETO_RULE.minFatEnergyShare;
}

const uniq = <T>(xs: readonly T[]): T[] => [...new Set(xs)];

/* ------------------------------------------------------------------ */
/* Item adapters                                                       */
/* ------------------------------------------------------------------ */

export type ExclusionReason = 'cardio_without_met';

export interface Exclusion {
  kind: 'exercise' | 'recipe';
  id: string;
  reason: ExclusionReason;
}

/**
 * One exercise. Returns an exclusion when the engine contract cannot be met without inventing data
 * (cardio needs a MET value for RW-24 calories; the content catalogue has none yet).
 */
export function exerciseToEngine(e: Exercise): EngineExercise | Exclusion {
  const pattern = PATTERN_TO_ENGINE[PATTERNS[e.pattern]];
  const met = (e as Exercise & { met?: number }).met;
  if (pattern === 'cardio' && met === undefined) return { kind: 'exercise', id: e.id, reason: 'cardio_without_met' };
  return {
    id: e.id,
    name: e.name,
    aliases: [...e.aliases],
    pattern,
    primaryMuscles: [...e.primaryMuscles],
    secondaryMuscles: [...e.secondaryMuscles],
    equipment: uniq(e.equipment.map((x) => EQUIPMENT_TO_ENGINE[x])),
    level: LEVEL_TO_ENGINE[e.level],
    unilateral: e.unilateral,
    mediaId: e.mediaId,
    contraindications: [...e.contraindications],
    compound: e.mechanics === 'compound',
    ...(met !== undefined ? { met } : {}),
    steps: [...e.instructions],
    tips: [...e.cues],
    source: e.source,
    licence: e.licence,
  };
}

function food(index: FoodIndex, id: string): Food {
  const f = index.get(id);
  if (!f) throw new Error(`Unknown food id "${id}"`);
  return f;
}

/**
 * One recipe. Ingredient grams become PER SERVING (the engine scales servings, content grams are for
 * the whole recipe); ids stay the content food ids (kebab-case; the engine normalises separators).
 * `prepMin` becomes the total time (content prepMin + cookMin), which is what the engine's
 * cooking-time filter means.
 */
export function recipeToEngine(r: Recipe, index: FoodIndex): EngineRecipe {
  const tags = uniq(r.dietTags.map((t) => DIET_TAG_TO_ENGINE[t]));
  if (isKeto(r)) tags.push('keto');
  return {
    id: r.id,
    name: r.title,
    cuisine: CUISINE_TO_ENGINE[r.cuisine],
    slots: [...r.slots],
    dietTags: tags,
    allergens: uniq(r.allergens.map((a) => ALLERGEN_TO_ENGINE[a])),
    proteinSource: PROTEIN_TO_ENGINE[r.mainProtein],
    ingredients: r.ingredients.map((ing) => {
      const f = food(index, ing.foodId);
      return { id: ing.foodId, name: f.name, grams: ing.grams / r.servings, fdcId: f.source.fdcId, aisle: f.category };
    }),
    perServing: { ...r.perServing },
    prepMin: r.prepMin + r.cookMin,
    costTier: r.costTier,
    scalable: { ...r.scalable },
    steps: [...r.steps],
    imageId: r.mediaId,
  };
}

export interface EngineCatalogues {
  exercises: EngineExercise[];
  recipes: EngineRecipe[];
  excluded: Exclusion[];
}

const isExclusion = (x: EngineExercise | Exclusion): x is Exclusion => 'reason' in x;

/** The whole catalogue in engine shape. Defaults to the bundled JSON. */
export function toEngineCatalogues(
  src: { exercises: readonly Exercise[]; recipes: readonly Recipe[]; foods: readonly Food[] } = {
    exercises: allExercises,
    recipes: allRecipes,
    foods: allFoods,
  },
): EngineCatalogues {
  const index = indexFoods(src.foods);
  const out: EngineCatalogues = { exercises: [], recipes: [], excluded: [] };
  for (const e of src.exercises) {
    const x = exerciseToEngine(e);
    if (isExclusion(x)) out.excluded.push(x);
    else out.exercises.push(x);
  }
  for (const r of src.recipes) out.recipes.push(recipeToEngine(r, index));
  return out;
}

let cached: EngineCatalogues | undefined;

/** Memoised `toEngineCatalogues()` of the bundled JSON (one conversion per process / Worker isolate). */
export function engineCatalogues(): EngineCatalogues {
  cached ??= toEngineCatalogues();
  return cached;
}
