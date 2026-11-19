import {
  ExerciseCatalogueSchema,
  ExerciseSchema,
  HistorySchema,
  LlmMealsOutputSchema,
  LlmWorkoutOutputSchema,
  ProfileSchema,
  RecipeCatalogueSchema,
  RecipeSchema,
} from '../src';
import { exerciseInputs, exercises } from './fixtures/exercises';
import { recipeInputs, recipes } from './fixtures/recipes';

const goodEx = exerciseInputs[0]!;
const goodRecipe = recipeInputs[0]!;

describe('catalogue schemas (contract for packages/content)', () => {
  test('fixture catalogues parse', () => {
    expect(exercises.length).toBeGreaterThan(100);
    expect(recipes.length).toBeGreaterThan(250);
    expect(ExerciseCatalogueSchema.safeParse(exerciseInputs).success).toBe(true);
    expect(RecipeCatalogueSchema.safeParse(recipeInputs).success).toBe(true);
  });

  test('exercise rejects bad slugs, overlaps, cardio without MET, empty muscles, bad level', () => {
    expect(ExerciseSchema.safeParse({ ...goodEx, id: 'Bad Id' }).success).toBe(false);
    expect(ExerciseSchema.safeParse({ ...goodEx, secondaryMuscles: goodEx.primaryMuscles }).success).toBe(false);
    expect(ExerciseSchema.safeParse({ ...goodEx, pattern: 'cardio' }).success).toBe(false);
    expect(ExerciseSchema.safeParse({ ...goodEx, primaryMuscles: [] }).success).toBe(false);
    expect(ExerciseSchema.safeParse({ ...goodEx, level: 4 }).success).toBe(false);
    expect(ExerciseSchema.safeParse({ ...goodEx, equipment: ['jetpack'] }).success).toBe(false);
    expect(ExerciseSchema.safeParse({ ...goodEx, steps: ['one'] }).success).toBe(false);
    expect(ExerciseSchema.safeParse({ ...goodEx, licence: '' }).success).toBe(false);
  });

  test('exercise defaults', () => {
    const { aliases: _a, contraindications: _c, secondaryMuscles: _s, ...min } = goodEx;
    const parsed = ExerciseSchema.parse(min);
    expect(parsed.aliases).toEqual([]);
    expect(parsed.contraindications).toEqual([]);
    expect(parsed.secondaryMuscles).toEqual([]);
  });

  test('duplicate ids rejected', () => {
    expect(ExerciseCatalogueSchema.safeParse([goodEx, goodEx]).success).toBe(false);
    expect(RecipeCatalogueSchema.safeParse([goodRecipe, goodRecipe]).success).toBe(false);
  });

  test('recipe rejects kcal/macro mismatch, vegan with animal allergens, bad portions, unknown allergens', () => {
    expect(RecipeSchema.safeParse({ ...goodRecipe, perServing: { kcal: 100, protein: 50, carbs: 50, fat: 20 } }).success).toBe(false);
    expect(RecipeSchema.safeParse({ ...goodRecipe, dietTags: ['vegan'], allergens: ['dairy'] }).success).toBe(false);
    expect(RecipeSchema.safeParse({ ...goodRecipe, scalable: { min: 2, max: 1 } }).success).toBe(false);
    expect(RecipeSchema.safeParse({ ...goodRecipe, allergens: ['crustaceans'] }).success).toBe(false);
    expect(RecipeSchema.safeParse({ ...goodRecipe, slots: [] }).success).toBe(false);
    expect(RecipeSchema.safeParse({ ...goodRecipe, costTier: 4 }).success).toBe(false);
    const dupIng = { ...goodRecipe, ingredients: [goodRecipe.ingredients[0], goodRecipe.ingredients[0]] };
    expect(RecipeSchema.safeParse(dupIng).success).toBe(false);
  });

  test('recipe defaults scalable to 0.5–3', () => {
    const { scalable: _s, ...rest } = goodRecipe;
    expect(RecipeSchema.parse(rest).scalable).toEqual({ min: 0.5, max: 3 });
  });
});

describe('profile + history schemas', () => {
  const base = { goal: 'fat_loss', sex: 'female', birthYear: 1990, heightCm: 165, weightKg: 70, experience: 'beginner', daysPerWeek: 3, sessionMin: 45 };
  test('defaults', () => {
    const p = ProfileSchema.parse(base);
    expect(p).toMatchObject({ dietType: 'omnivore', mealsPerDay: 3, budget: 2, cookMin: 30, lifestyle: 'light', units: 'metric', equipment: [], pregnant: false });
  });
  test('bounds', () => {
    expect(ProfileSchema.safeParse({ ...base, daysPerWeek: 7 }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...base, weightKg: 20 }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...base, heightCm: 250 }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...base, mealsPerDay: 1 }).success).toBe(false);
  });
  test('empty history parses', () => {
    expect(HistorySchema.parse({})).toEqual({ sessions: [], sets: [], meals: [], weights: [], signals: { neverShow: [], moreLike: [] } });
    expect(HistorySchema.safeParse({ meals: [{ date: '2026/11/01', slot: 'lunch', recipeId: 'x' }] }).success).toBe(false);
  });
});

describe('LLM output schemas (sheet 28)', () => {
  test('plan_week and meals_week shapes', () => {
    expect(LlmWorkoutOutputSchema.safeParse({ sessions: [{ day: '2026-11-23', title: 'Push', items: [{ exercise_id: 'bench_press', sets: 3, reps: 8, rest_s: 120 }] }] }).success).toBe(true);
    expect(LlmWorkoutOutputSchema.safeParse({ sessions: [{ day: '2026-11-23', title: 'Push', items: [{ exercise_id: 'bench_press', sets: 30, reps: 8, rest_s: 120 }] }] }).success).toBe(false);
    expect(LlmMealsOutputSchema.safeParse({ days: [{ date: '2026-11-23', meals: [{ slot: 'lunch', recipe_id: 'x' }] }] }).success).toBe(true);
    expect(LlmMealsOutputSchema.safeParse({ days: [{ date: '2026-11-23', meals: [{ slot: 'brunch', recipe_id: 'x' }] }] }).success).toBe(false);
  });
});
