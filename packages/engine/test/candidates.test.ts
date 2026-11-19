import {
  FULL_GYM,
  allergenOk,
  dietOk,
  dislikedIngredients,
  equipmentOk,
  exerciseAllowed,
  exerciseCandidates,
  exerciseConstraints,
  recipeCandidates,
  recipeConstraints,
  recipeSafe,
  slotCandidates,
  ProfileSchema,
  type DietType,
} from '../src';
import { exercises } from './fixtures/exercises';
import { recipes } from './fixtures/recipes';

const profile = (over: object) =>
  ProfileSchema.parse({ goal: 'maintain', sex: 'male', birthYear: 1990, heightCm: 180, weightKg: 80, experience: 'intermediate', daysPerWeek: 3, sessionMin: 60, equipment: FULL_GYM, ...over });

describe('exercise candidates', () => {
  test('equipment: all required items must be available; bodyweight always ok', () => {
    const bench = exercises.find((e) => e.id === 'bench_press')!;
    expect(equipmentOk(bench, ['barbell'])).toBe(false);
    expect(equipmentOk(bench, ['barbell', 'bench'])).toBe(true);
    expect(equipmentOk(exercises.find((e) => e.id === 'push_up')!, [])).toBe(true);
  });

  test('home profile only gets home equipment; injuries and level filter', () => {
    const c = exerciseConstraints(profile({ equipment: ['bodyweight', 'band'], injuries: ['knee'], experience: 'beginner' }), ['plank']);
    const pool = exerciseCandidates(exercises, c);
    expect(pool.length).toBeGreaterThan(10);
    for (const e of pool) {
      expect(e.equipment.every((x) => ['bodyweight', 'band'].includes(x))).toBe(true);
      expect(e.contraindications).not.toContain('knee');
      expect(e.level).toBeLessThanOrEqual(2);
      expect(e.id).not.toBe('plank');
    }
    expect(exerciseAllowed(exercises.find((e) => e.id === 'nordic_curl')!, c)).toBe(false);
  });

  test('slot candidates: isolation slot needs the target muscle as primary', () => {
    const iso = slotCandidates(exercises, { pattern: 'isolation', muscle: 'biceps' });
    expect(iso.length).toBeGreaterThanOrEqual(6);
    iso.forEach((e) => expect(e.primaryMuscles).toContain('biceps'));
    const squats = slotCandidates(exercises, { pattern: 'squat' });
    squats.forEach((e) => expect(e.pattern).toBe('squat'));
  });

  test('every pattern has 6+ variants in the fixture catalogue', () => {
    for (const p of ['squat', 'hinge', 'push_h', 'push_v', 'pull_h', 'pull_v', 'lunge', 'core'] as const) {
      expect(slotCandidates(exercises, { pattern: p }).length).toBeGreaterThanOrEqual(6);
    }
  });
});

describe('recipe candidates', () => {
  const tags = (t: string[]) => ({ dietTags: t as never });
  test.each<[DietType, string[], boolean]>([
    ['omnivore', [], true],
    ['halal', ['halal'], true],
    ['halal', ['vegetarian'], false],
    ['vegetarian', ['vegan'], true],
    ['vegetarian', ['pescatarian'], false],
    ['vegan', ['vegetarian'], false],
    ['pescatarian', ['vegetarian'], true],
    ['keto', ['low_carb'], false],
    ['keto', ['keto'], true],
  ])('diet %s with tags %j → %s', (diet, t, ok) => {
    expect(dietOk(tags(t), diet)).toBe(ok);
  });

  test('allergens + dislikes', () => {
    expect(allergenOk({ allergens: ['dairy'] }, ['nuts'])).toBe(true);
    expect(allergenOk({ allergens: ['dairy', 'nuts'] }, ['nuts'])).toBe(false);
    const r = recipes.find((x) => x.ingredients.some((i) => i.id === 'spinach'))!;
    expect(dislikedIngredients(r, ['Spinach'])).toEqual(['spinach']);
    expect(dislikedIngredients(r, ['  '])).toEqual([]);
    expect(dislikedIngredients(r, [])).toEqual([]);
  });

  test('hard filters never relax; soft filters relax cuisine → time → budget', () => {
    const c = recipeConstraints(profile({ dietType: 'vegan', allergies: ['soy'], cuisines: ['thai'], cookMin: 5, budget: 1 }));
    const { pool, relaxed } = recipeCandidates(recipes, c, 'lunch', new Set(), 4);
    expect(relaxed).toEqual(['cuisine', 'time']);
    expect(pool.length).toBeGreaterThanOrEqual(4);
    for (const r of pool) {
      expect(r.dietTags).toContain('vegan');
      expect(r.allergens).not.toContain('soy');
      expect(r.slots).toContain('lunch');
      expect(r.costTier).toBeLessThanOrEqual(1);
    }
  });

  test('exclude set and never-show are respected', () => {
    const c = recipeConstraints(profile({}), ['western_chicken_breast_potato']);
    const all = recipeCandidates(recipes, c, 'dinner').pool;
    expect(all.find((r) => r.id === 'western_chicken_breast_potato')).toBeUndefined();
    const ex = new Set(all.slice(0, 5).map((r) => r.id));
    const less = recipeCandidates(recipes, c, 'dinner', ex).pool;
    expect(less.some((r) => ex.has(r.id))).toBe(false);
    expect(recipeSafe(recipes[0]!, { dietType: 'omnivore', allergies: [], dislikes: [] })).toBe(true);
  });

  test('cuisine filter applies when enough recipes', () => {
    const c = recipeConstraints(profile({ cuisines: ['arab'], cookMin: 60, budget: 3 }));
    const { pool, relaxed } = recipeCandidates(recipes, c, 'dinner');
    expect(relaxed).toEqual([]);
    pool.forEach((r) => expect(r.cuisine).toBe('arab'));
  });
});
