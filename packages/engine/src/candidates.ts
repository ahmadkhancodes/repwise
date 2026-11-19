/**
 * Candidate pools (sheet 28 step 2): exercises fitting equipment/injuries/level and
 * recipes fitting diet/allergens/dislikes/cuisine/budget/time. Hard filters (safety) are
 * never relaxed; soft filters (cuisine, time, budget) relax in that order when a pool is too small.
 */
import type {
  Allergen,
  Cuisine,
  DietType,
  Equipment,
  Exercise,
  Experience,
  Injury,
  MealSlot,
  Profile,
  Recipe,
} from './schemas';
import type { SlotDef } from './split';

// ---------------------------------------------------------------------------
// Exercises
// ---------------------------------------------------------------------------

export const FULL_GYM: Equipment[] = [
  'barbell', 'dumbbell', 'cable', 'machine', 'kettlebell', 'band', 'bodyweight', 'smith', 'ez_bar', 'trap_bar', 'pullup_bar', 'bench',
  'cardio_machine', 'squat_rack', 'dip_station', 'landmine', 'box', 'medicine_ball', 'ab_wheel', 'stability_ball', 'weight_plate',
  'sled', 'jump_rope', 'foam_roller', 'mat',
];

/** Equipment presets for the onboarding "gym type" step (S04). The user can edit the list afterwards. */
export const EQUIPMENT_PRESETS = {
  full_gym: FULL_GYM,
  home_dumbbells: ['bodyweight', 'dumbbell', 'bench', 'band', 'mat'],
  bodyweight: ['bodyweight', 'mat'],
} as const satisfies Record<string, readonly Equipment[]>;

/** Items that are never required: 'bodyweight' means nothing is needed, and a mat is comfort only (a towel or the floor works). */
export const NEVER_REQUIRED: ReadonlySet<Equipment> = new Set<Equipment>(['bodyweight', 'mat']);

/** Owning the first item means owning the listed ones too (profile vocabulary is coarser than the catalogue's). */
export const EQUIPMENT_IMPLIES: Partial<Record<Equipment, readonly Equipment[]>> = {
  cardio_machine: ['treadmill', 'bike', 'rower', 'elliptical', 'stair_climber'],
};

export const MAX_LEVEL: Record<Experience, 1 | 2 | 3> = { beginner: 2, intermediate: 3, advanced: 3 };

export interface ExerciseConstraints {
  equipment: readonly Equipment[];
  injuries: readonly Injury[];
  maxLevel: 1 | 2 | 3;
  neverShow?: ReadonlySet<string>;
}

export function exerciseConstraints(profile: Pick<Profile, 'equipment' | 'injuries' | 'experience'>, neverShow?: Iterable<string>): ExerciseConstraints {
  return {
    equipment: profile.equipment,
    injuries: profile.injuries,
    maxLevel: MAX_LEVEL[profile.experience],
    neverShow: new Set(neverShow ?? []),
  };
}

/** Every required item available ('bodyweight' and 'mat' need nothing; 'cardio_machine' covers each machine). */
export function equipmentOk(ex: Pick<Exercise, 'equipment'>, available: readonly Equipment[]): boolean {
  return ex.equipment.every(
    (e) => NEVER_REQUIRED.has(e) || available.includes(e) || available.some((a) => EQUIPMENT_IMPLIES[a]?.includes(e) ?? false),
  );
}

export function injuryOk(ex: Pick<Exercise, 'contraindications'>, injuries: readonly Injury[]): boolean {
  return !ex.contraindications.some((c) => injuries.includes(c));
}

export function exerciseAllowed(ex: Exercise, c: ExerciseConstraints): boolean {
  return (
    equipmentOk(ex, c.equipment) &&
    injuryOk(ex, c.injuries) &&
    ex.level <= c.maxLevel &&
    !(c.neverShow?.has(ex.id) ?? false)
  );
}

export function exerciseCandidates(catalogue: readonly Exercise[], c: ExerciseConstraints): Exercise[] {
  return catalogue.filter((ex) => exerciseAllowed(ex, c));
}

/** Exercises that can fill a template slot. */
export function slotCandidates(pool: readonly Exercise[], slot: Pick<SlotDef, 'pattern' | 'muscle'>): Exercise[] {
  return pool.filter((ex) => {
    if (ex.pattern !== slot.pattern) return false;
    if (slot.pattern === 'isolation' && slot.muscle) return ex.primaryMuscles.includes(slot.muscle);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

/**
 * Fine cuisines (profile vocabulary) → the catalogue groups that contain them (D26).
 * A preference matches a recipe when the values are equal or one is a group of the other.
 */
export const CUISINE_GROUPS: Partial<Record<Cuisine, readonly Cuisine[]>> = {
  arab: ['middle_eastern', 'gulf', 'north_african'],
  turkish: ['middle_eastern'],
  persian: ['middle_eastern'],
  greek: ['mediterranean'],
  chinese: ['east_asian'],
  japanese: ['east_asian'],
  korean: ['east_asian'],
  thai: ['southeast_asian'],
  western: ['american', 'british'],
  other: ['global'],
};

export function cuisineMatches(preferred: Cuisine, recipe: Cuisine): boolean {
  return preferred === recipe || (CUISINE_GROUPS[preferred]?.includes(recipe) ?? false) || (CUISINE_GROUPS[recipe]?.includes(preferred) ?? false);
}

export function cuisinePreferred(preferred: readonly Cuisine[], recipe: Cuisine): boolean {
  return preferred.some((p) => cuisineMatches(p, recipe));
}

export function dietOk(recipe: Pick<Recipe, 'dietTags'>, diet: DietType): boolean {
  const t = recipe.dietTags;
  switch (diet) {
    case 'omnivore':
      return true;
    case 'halal':
      return t.includes('halal');
    case 'vegetarian':
      return t.includes('vegetarian') || t.includes('vegan');
    case 'vegan':
      return t.includes('vegan');
    case 'pescatarian':
      return t.includes('pescatarian') || t.includes('vegetarian') || t.includes('vegan');
    case 'keto':
      return t.includes('keto');
  }
}

export function allergenOk(recipe: Pick<Recipe, 'allergens'>, allergies: readonly Allergen[]): boolean {
  return !recipe.allergens.some((a) => allergies.includes(a));
}

/**
 * Case-insensitive: dislike matches an ingredient id exactly or appears in its id/name.
 * Ids may use '_' or '-' (the content catalogue uses kebab-case), so separators are normalised.
 */
export function dislikedIngredients(recipe: Pick<Recipe, 'ingredients'>, dislikes: readonly string[]): string[] {
  const norm = (x: string) => x.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const ds = dislikes.map((d) => d.trim().toLowerCase()).filter((d) => d.length > 0);
  if (ds.length === 0) return [];
  return recipe.ingredients
    .filter((ing) => {
      const id = norm(ing.id);
      const name = ing.name.toLowerCase();
      return ds.some((d) => id === norm(d) || id.includes(norm(d)) || name.includes(d));
    })
    .map((ing) => ing.id);
}

export interface RecipeConstraints {
  dietType: DietType;
  allergies: readonly Allergen[];
  dislikes: readonly string[];
  cuisines: readonly Cuisine[];
  budget: 1 | 2 | 3;
  cookMin: number;
  neverShow?: ReadonlySet<string>;
}

export function recipeConstraints(
  profile: Pick<Profile, 'dietType' | 'allergies' | 'dislikes' | 'cuisines' | 'budget' | 'cookMin'>,
  neverShow?: Iterable<string>,
): RecipeConstraints {
  return {
    dietType: profile.dietType,
    allergies: profile.allergies,
    dislikes: profile.dislikes,
    cuisines: profile.cuisines,
    budget: profile.budget,
    cookMin: profile.cookMin,
    neverShow: new Set(neverShow ?? []),
  };
}

/** Hard safety filters only (diet, allergens, dislikes, never-show). Never relaxed. */
export function recipeSafe(recipe: Recipe, c: Pick<RecipeConstraints, 'dietType' | 'allergies' | 'dislikes' | 'neverShow'>): boolean {
  return (
    dietOk(recipe, c.dietType) &&
    allergenOk(recipe, c.allergies) &&
    dislikedIngredients(recipe, c.dislikes).length === 0 &&
    !(c.neverShow?.has(recipe.id) ?? false)
  );
}

export type Relaxation = 'cuisine' | 'time' | 'budget';

export interface RecipePool {
  pool: Recipe[];
  relaxed: Relaxation[];
}

/**
 * Recipes for one slot. `exclude` = ids blocked by the no-repeat window.
 * Soft filters relax (cuisine → time → budget) while the pool has fewer than `minPool` items.
 */
export function recipeCandidates(
  catalogue: readonly Recipe[],
  c: RecipeConstraints,
  slot: MealSlot,
  exclude: ReadonlySet<string> = new Set(),
  minPool = 4,
  /** Skip the hard safety filter because `catalogue` is already filtered with `recipeSafe`. */
  presafe = false,
): RecipePool {
  const hard = catalogue.filter((r) => r.slots.includes(slot) && !exclude.has(r.id) && (presafe || recipeSafe(r, c)));
  const relaxed: Relaxation[] = [];
  let useCuisine = c.cuisines.length > 0;
  let useTime = true;
  let useBudget = true;
  const apply = () =>
    hard.filter(
      (r) =>
        (!useCuisine || cuisinePreferred(c.cuisines, r.cuisine)) &&
        (!useTime || r.prepMin <= c.cookMin) &&
        (!useBudget || r.costTier <= c.budget),
    );
  let pool = apply();
  if (pool.length < minPool && useCuisine) {
    useCuisine = false;
    relaxed.push('cuisine');
    pool = apply();
  }
  if (pool.length < minPool) {
    useTime = false;
    relaxed.push('time');
    pool = apply();
  }
  if (pool.length < minPool) {
    useBudget = false;
    relaxed.push('budget');
    pool = apply();
  }
  return { pool, relaxed };
}
