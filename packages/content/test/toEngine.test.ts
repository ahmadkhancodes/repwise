import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// The engine package is CommonJS TypeScript: take its exports from the default (module.exports) object.
import * as engineNs from '@repwise/engine';
import {
  ALLERGEN_TO_ENGINE,
  exercises,
  foods,
  isKeto,
  recipes,
  recipeToEngine,
  indexFoods,
  toEngineCatalogues,
  engineCatalogues,
} from './helpers';

const engine = (engineNs as typeof engineNs & { default?: typeof engineNs }).default ?? engineNs;
const {
  ALLERGENS: ENGINE_ALLERGENS,
  CUISINES: ENGINE_CUISINES,
  ExerciseCatalogueSchema,
  ExerciseSchema,
  RecipeCatalogueSchema,
  RecipeSchema,
  dietOk,
} = engine;

/**
 * Items the engine cannot take yet, with the reason. Pinned: a new exclusion fails this test.
 * Empty since the 13 cardio exercises gained Compendium MET values (D28 closed by D33).
 */
const ALLOWED_EXCLUSIONS: Record<string, string> = {};

describe('toEngine adapter', () => {
  const out = toEngineCatalogues({ exercises, recipes, foods });

  it('every exercise parses with the engine ExerciseSchema, except the pinned exclusions', () => {
    for (const e of out.exercises) {
      const r = ExerciseSchema.safeParse(e);
      assert.ok(r.success, `${e.id}: ${r.success ? '' : r.error.message}`);
    }
    assert.ok(ExerciseCatalogueSchema.safeParse(out.exercises).success);
    const excluded = Object.fromEntries(out.excluded.map((x) => [x.id, x.reason]));
    assert.deepEqual(excluded, ALLOWED_EXCLUSIONS);
    assert.equal(out.exercises.length + out.excluded.length, exercises.length);
  });

  it('every recipe parses with the engine RecipeSchema (zero dropped)', () => {
    assert.equal(out.recipes.length, recipes.length);
    for (const r of out.recipes) {
      const p = RecipeSchema.safeParse(r);
      assert.ok(p.success, `${r.id}: ${p.success ? '' : p.error.message}`);
    }
    assert.ok(RecipeCatalogueSchema.safeParse(out.recipes).success);
    assert.ok(!out.excluded.some((x) => x.kind === 'recipe'));
  });

  it('parsing is lossless for the mapped fields (zod defaults add nothing)', () => {
    for (const e of out.exercises) assert.deepEqual(ExerciseSchema.parse(e), e);
    for (const r of out.recipes) assert.deepEqual(RecipeSchema.parse(r), r);
  });

  it('macros are carried, never recomputed or invented', () => {
    const byId = new Map(recipes.map((r) => [r.id, r]));
    for (const r of out.recipes) assert.deepEqual(r.perServing, byId.get(r.id)!.perServing);
  });

  it('every cardio exercise carries its Compendium MET value into the engine', () => {
    const cardio = exercises.filter((e) => e.pattern === 'cardio');
    assert.ok(cardio.length >= 13);
    const byId = new Map(out.exercises.map((e) => [e.id, e]));
    for (const e of cardio) {
      assert.ok(e.met !== undefined && e.met > 0, e.id);
      assert.equal(byId.get(e.id)?.met, e.met, e.id);
    }
  });

  it('ingredient grams are per serving and keep the USDA fdcId', () => {
    const r = recipes.find((x) => x.servings > 1)!;
    const e = recipeToEngine(r, indexFoods(foods));
    r.ingredients.forEach((ing, i) => {
      assert.equal(e.ingredients[i]!.id, ing.foodId);
      assert.ok(Math.abs(e.ingredients[i]!.grams * r.servings - ing.grams) < 1e-9);
      assert.equal(e.ingredients[i]!.fdcId, foods.find((f) => f.id === ing.foodId)!.source.fdcId);
    });
    assert.equal(e.prepMin, r.prepMin + r.cookMin);
  });

  it('allergens: every content allergen maps to an engine allergen, shellfish groups merge', () => {
    for (const a of Object.values(ALLERGEN_TO_ENGINE)) assert.ok((ENGINE_ALLERGENS as readonly string[]).includes(a));
    assert.equal(ALLERGEN_TO_ENGINE.crustaceans, 'shellfish');
    assert.equal(ALLERGEN_TO_ENGINE.molluscs, 'shellfish');
    const byId = new Map(out.recipes.map((r) => [r.id, r]));
    for (const r of recipes) {
      const mapped = byId.get(r.id)!.allergens;
      for (const a of r.allergens) assert.ok(mapped.includes(ALLERGEN_TO_ENGINE[a]), `${r.id} lost ${a}`);
    }
  });

  it('diet tags: halal_friendly → halal; diet filters agree with the content tags', () => {
    const byId = new Map(out.recipes.map((r) => [r.id, r]));
    for (const r of recipes) {
      const e = byId.get(r.id)!;
      assert.equal(dietOk(e, 'halal'), r.dietTags.includes('halal_friendly'), r.id);
      assert.equal(dietOk(e, 'vegan'), r.dietTags.includes('vegan'), r.id);
      assert.equal(dietOk(e, 'vegetarian'), r.dietTags.includes('vegetarian') || r.dietTags.includes('vegan'), r.id);
      assert.equal(dietOk(e, 'pescatarian'), r.dietTags.some((t) => t === 'pescatarian' || t === 'vegetarian' || t === 'vegan'), r.id);
      assert.equal(e.dietTags.includes('keto'), isKeto(r), r.id);
    }
  });

  it('cuisines and protein sources are engine values', () => {
    for (const r of out.recipes) assert.ok((ENGINE_CUISINES as readonly string[]).includes(r.cuisine));
    const pork = out.recipes.filter((r) => r.proteinSource === 'pork');
    assert.ok(pork.every((r) => !r.dietTags.includes('halal')));
  });

  it('engineCatalogues() is memoised', () => {
    assert.equal(engineCatalogues(), engineCatalogues());
  });
});
