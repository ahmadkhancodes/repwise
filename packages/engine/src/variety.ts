/**
 * Uniqueness rules ("every time different", sheet 28):
 * - exercise rotation per movement pattern (main lifts held for the block, accessories rotate,
 *   no non-main variant repeats in consecutive sessions for the same pattern key);
 * - session fingerprint = hash of ordered exercise ids, must differ from the last 10 sessions;
 * - meal no-repeat window (default 14 days, 7–30), one protein source per day, cuisine rotation,
 *   grocery-aware ingredient re-use;
 * - 'never show again' / 'more like this' weights.
 * Randomness comes only from the seeded PRNG in random.ts.
 */
import { daysBetween, type ISODate } from './dates';
import { hashHex } from './random';
import { cuisinePreferred } from './candidates';
import type { Cuisine, Exercise, ProteinSource, Recipe } from './schemas';

export { createRng, cyrb53, hashHex, type Rng } from './random';

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export const FINGERPRINT_WINDOW = 10;

/** Hash of the ORDERED exercise ids. */
export function sessionFingerprint(exerciseIds: readonly string[]): string {
  return `fp_${hashHex(exerciseIds.join('|'))}`;
}

export function fingerprintIsFresh(fp: string, previous: readonly string[], window = FINGERPRINT_WINDOW): boolean {
  return !previous.slice(-window).includes(fp);
}

export interface SessionVariantRecord {
  exerciseIds: readonly string[];
  /** Pattern key per exercise (same order). */
  patternKeys?: readonly string[];
  /** Exercises that were the block's main lifts (exempt from rotation). */
  mainExerciseIds?: readonly string[];
}

/**
 * For each pattern key, the non-main exercises used in the most recent session that had
 * a non-main exercise for that key. Sessions in chronological order.
 */
export function lastVariantsByPattern(sessions: readonly SessionVariantRecord[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const s of sessions) {
    if (!s.patternKeys) continue;
    const main = new Set(s.mainExerciseIds ?? []);
    const local = new Map<string, Set<string>>();
    s.exerciseIds.forEach((id, i) => {
      const key = s.patternKeys?.[i];
      if (!key || main.has(id)) return;
      if (!local.has(key)) local.set(key, new Set());
      local.get(key)?.add(id);
    });
    for (const [k, v] of local) out.set(k, v);
  }
  return out;
}

/** Ids in `session` that repeat a non-main variant from the previous session of the same pattern key. */
export function consecutiveRepeats(session: SessionVariantRecord, previous: Map<string, Set<string>>): string[] {
  const main = new Set(session.mainExerciseIds ?? []);
  const bad: string[] = [];
  session.exerciseIds.forEach((id, i) => {
    const key = session.patternKeys?.[i];
    if (!key || main.has(id)) return;
    if (previous.get(key)?.has(id)) bad.push(id);
  });
  return bad;
}

export interface ExerciseWeightContext {
  moreLike: ReadonlySet<string>;
  /** Primary muscles of exercises the user marked 'more like this'. */
  likedMuscles?: ReadonlySet<string>;
  /** How often each exercise appeared in the recent sessions. */
  recentUse?: ReadonlyMap<string, number>;
}

/** Candidate weight for an exercise (neverShow is filtered earlier → weight 0). */
export function exerciseWeight(ex: Exercise, ctx: ExerciseWeightContext): number {
  let w = 1;
  if (ctx.moreLike.has(ex.id)) w *= 3;
  else if (ctx.likedMuscles && ex.primaryMuscles.some((m) => ctx.likedMuscles?.has(m))) w *= 1.3;
  const used = ctx.recentUse?.get(ex.id) ?? 0;
  w /= 1 + used;
  return w;
}

// ---------------------------------------------------------------------------
// Meals
// ---------------------------------------------------------------------------

export const NO_REPEAT_DEFAULT = 14;
export const NO_REPEAT_MIN = 7;
export const NO_REPEAT_MAX = 30;

export function clampNoRepeatDays(days: number | undefined): number {
  if (days === undefined || !Number.isFinite(days)) return NO_REPEAT_DEFAULT;
  return Math.min(NO_REPEAT_MAX, Math.max(NO_REPEAT_MIN, Math.round(days)));
}

/** Recipes used within `windowDays` of `date` (|Δ| < window) — blocked for that date. */
export function blockedRecipes(meals: readonly { date: ISODate; recipeId: string }[], date: ISODate, windowDays: number): Set<string> {
  const out = new Set<string>();
  for (const m of meals) {
    if (Math.abs(daysBetween(m.date, date)) < windowDays) out.add(m.recipeId);
  }
  return out;
}

/** Protein sources that count for the once-a-day rule ('none' is exempt). */
/** 'none' (no dominant source) and 'grains' (a cereal base, not a protein food) are exempt from the once-a-day rule. */
export function countsAsProteinSource(source: ProteinSource): boolean {
  return source !== 'none' && source !== 'grains';
}

const STAPLE_RE = /(^|[_-])(salt|pepper|water|oil|spice|spices|herbs|stock)([_-]|$)/;
const stapleCache = new Map<string, boolean>();
export function isStaple(ingredientId: string): boolean {
  let v = stapleCache.get(ingredientId);
  if (v === undefined) {
    v = STAPLE_RE.test(ingredientId);
    if (stapleCache.size < 50_000) stapleCache.set(ingredientId, v);
  }
  return v;
}

export interface RecipeWeightContext {
  moreLike: ReadonlySet<string>;
  likedCuisines?: ReadonlySet<Cuisine>;
  likedSources?: ReadonlySet<ProteinSource>;
  preferredCuisines?: readonly Cuisine[];
  /** Cuisine of the previous meal (rotation penalty). */
  previousCuisine?: Cuisine;
  /** Non-staple ingredient id → times already used this week (grocery re-use). */
  ingredientUse?: ReadonlyMap<string, number>;
  /** Target protein kcal share for the remaining meals of the day (4·P / kcal). */
  proteinShareTarget?: number;
}

export function proteinShare(r: Pick<Recipe, 'perServing'>): number {
  return r.perServing.kcal > 0 ? (4 * r.perServing.protein) / r.perServing.kcal : 0;
}

/** Candidate weight for a recipe (neverShow / recent / allergens are filtered earlier). */
export function recipeWeight(r: Recipe, ctx: RecipeWeightContext): number {
  let w = 1;
  if (ctx.moreLike.has(r.id)) w *= 3;
  if (ctx.likedCuisines?.has(r.cuisine)) w *= 1.3;
  if (ctx.likedSources?.has(r.proteinSource)) w *= 1.2;
  if (ctx.preferredCuisines && ctx.preferredCuisines.length > 0 && cuisinePreferred(ctx.preferredCuisines, r.cuisine)) w *= 1.5;
  if (ctx.previousCuisine && ctx.previousCuisine === r.cuisine) w *= 0.35;
  if (ctx.ingredientUse) {
    let shared = 0;
    for (const ing of r.ingredients) {
      if (isStaple(ing.id)) continue;
      const n = ctx.ingredientUse.get(ing.id) ?? 0;
      if (n >= 1 && n <= 2) shared += 1; // re-use across 2–3 meals per week
    }
    w *= Math.min(2, 1 + 0.25 * shared);
  }
  if (ctx.proteinShareTarget !== undefined) {
    const d = (proteinShare(r) - ctx.proteinShareTarget) / 0.1;
    w *= Math.exp(-d * d) + 0.05;
  }
  return w;
}

/** Number of non-staple ingredients shared by ≥ 2 of the recipes (grocery re-use metric). */
export function sharedIngredientCount(recipes: readonly Pick<Recipe, 'ingredients'>[]): number {
  const count = new Map<string, number>();
  for (const r of recipes) {
    for (const id of new Set(r.ingredients.map((i) => i.id))) {
      if (!isStaple(id)) count.set(id, (count.get(id) ?? 0) + 1);
    }
  }
  return [...count.values()].filter((n) => n >= 2).length;
}

/** Weighted signals derived from 'more like this' ids. */
export function likedTraits(
  moreLike: ReadonlySet<string>,
  recipes: ReadonlyMap<string, Recipe>,
): { cuisines: Set<Cuisine>; sources: Set<ProteinSource> } {
  const cuisines = new Set<Cuisine>();
  const sources = new Set<ProteinSource>();
  for (const id of moreLike) {
    const r = recipes.get(id);
    if (r) {
      cuisines.add(r.cuisine);
      if (countsAsProteinSource(r.proteinSource)) sources.add(r.proteinSource);
    }
  }
  return { cuisines, sources };
}
