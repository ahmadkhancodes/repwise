import { addDays, startOfWeek, type DayMealPlan } from '@repwise/engine';

import { getCatalog } from '@/services/catalog';

import { allergenHits } from '../logic/allergens';
import { dietSuitable, engineRecipes } from '../logic/engineCatalog';
import { historyFrom, planWeekMeals, rebalance, swapOptions, validateMealDays } from '../logic/plan';
import { toMealProfile, type ProfileLike } from '../logic/profile';

const NOW = Date.UTC(2026, 10, 19, 9);
const base: ProfileLike = {
  goal: 'fat_loss',
  sex: 'male',
  birthYear: 1992,
  heightCm: 180,
  weightKg: 84,
  experience: 'intermediate',
  days: 4,
  sessionMin: 60,
  dietType: 'omnivore',
  allergies: [],
  mealsPerDay: 3,
  cookMin: 45,
  budget: '2',
  activityLevel: 'light',
};

/** Acceptance profiles: 4 profiles × 4 weeks = 112 generated days. */
const PROFILES: [string, ProfileLike][] = [
  ['omnivore fat loss', base],
  ['halal muscle gain, nuts + sesame', { ...base, goal: 'muscle_gain', dietType: 'halal', allergies: ['nuts', 'sesame'], mealsPerDay: 4 }],
  ['vegetarian woman, milk allergy', { ...base, sex: 'female', weightKg: 62, heightCm: 165, dietType: 'vegetarian', allergies: ['milk'], goal: 'maintain' }],
  ['dairy + shellfish (engine spelling), 5 meals', { ...base, allergies: ['dairy', 'shellfish'], mealsPerDay: 5 }],
];

const HARD = ['allergen', 'diet_mismatch', 'unknown_recipe', 'slot_mismatch', 'never_show', 'disliked_ingredient', 'protein_source_repeat', 'recipe_repeat_window'];

const cat = getCatalog();

function simulate(p: ProfileLike, weeks: number) {
  const mp = toMealProfile(p)!;
  const recipes = engineRecipes(cat.recipes, cat.foodById, { allergies: mp.allergies, dietType: mp.dietType });
  let history = historyFrom([], { neverShow: [], moreLike: [] });
  const days: DayMealPlan[] = [];
  const errors: string[] = [];
  let date = startOfWeek('2026-11-16');
  for (let w = 0; w < weeks; w++) {
    const week = planWeekMeals({ profile: mp.engine, history, recipes, date, now: NOW });
    errors.push(...week.validation.errors.map((e) => e.code));
    days.push(...week.days);
    history = {
      ...history,
      meals: [...(history.meals ?? []), ...week.days.flatMap((d) => d.meals.map((m) => ({ date: d.date, slot: m.slot, recipeId: m.recipeId })))],
    };
    date = addDays(date, 7);
  }
  return { mp, recipes, days, errors, history };
}

describe('meal plan acceptance (real catalogue, engine validate)', () => {
  it.each(PROFILES)('%s: every generated day passes macro + allergen + diet checks', (_name, p) => {
    const { mp, days, errors } = simulate(p, 4);
    expect(days).toHaveLength(28);
    expect(errors.filter((c) => HARD.includes(c))).toEqual([]);
    // kcal ±5% and protein ±10 g on every day (engine validate).
    expect(errors.filter((c) => c === 'kcal_out_of_range' || c === 'protein_out_of_range')).toEqual([]);
    for (const d of days) {
      expect(d.meals.length).toBeGreaterThan(0);
      for (const m of d.meals) {
        const r = cat.recipeById.get(m.recipeId)!;
        // Independent of the engine: EU-14 allergens and diet straight from the content data.
        expect(allergenHits(r, mp.allergies)).toEqual([]);
        expect(dietSuitable(r, mp.dietType)).toBe(true);
      }
    }
  });

  it('tight filters (pescatarian, gluten + egg) never break the hard rules', () => {
    const { mp, days, errors } = simulate({ ...base, dietType: 'pescatarian', allergies: ['gluten', 'eggs'], goal: 'recomp' }, 2);
    expect(errors.filter((c) => c === 'allergen' || c === 'diet_mismatch' || c === 'unknown_recipe')).toEqual([]);
    for (const m of days.flatMap((d) => d.meals)) {
      expect(allergenHits(cat.recipeById.get(m.recipeId)!, mp.allergies)).toEqual([]);
    }
  });

  it('validate catches an allergen slipped into a stored day', () => {
    const { mp, recipes, days } = simulate({ ...base, allergies: ['milk'] }, 1);
    const all = engineRecipes(cat.recipes, cat.foodById, { allergies: [], dietType: 'omnivore' });
    const milky = all.find((r) => r.allergens.includes('dairy') && r.slots.includes('lunch'))!;
    const day = days[0]!;
    const bad: DayMealPlan = {
      ...day,
      meals: day.meals.map((m, i) => (i === 0 ? { ...m, slot: 'lunch', recipeId: milky.id } : m)),
    };
    const res = validateMealDays(
      { profile: mp.engine, history: historyFrom([], { neverShow: [], moreLike: [] }), recipes: [...recipes, milky], now: NOW },
      [bad],
    );
    expect(res.errors.map((e) => e.code)).toContain('allergen');
  });
});

describe('swapOptions (engine swapMeal)', () => {
  it('returns up to 3 safe alternatives within ±10% kcal and protein', () => {
    const { mp, recipes, days, history } = simulate({ ...base, allergies: ['peanuts'] }, 1);
    const day = days[2]!;
    const idx = day.meals.findIndex((m) => m.slot === 'dinner');
    const meal = day.meals[idx]!;
    const opts = swapOptions({ profile: mp.engine, history, recipes, day, index: idx, now: NOW });
    expect(opts.length).toBeGreaterThan(0);
    expect(opts.length).toBeLessThanOrEqual(3);
    for (const o of opts) {
      expect(o.recipeId).not.toBe(meal.recipeId);
      expect(o.slot).toBe('dinner');
      expect(Math.abs(o.kcal - meal.kcal)).toBeLessThanOrEqual(meal.kcal * 0.1 + 1e-9);
      expect(Math.abs(o.protein - meal.protein)).toBeLessThanOrEqual(Math.max(meal.protein * 0.1, 3) + 1e-9);
      expect(allergenHits(cat.recipeById.get(o.recipeId)!, mp.allergies)).toEqual([]);
      expect(day.meals.some((m) => m.recipeId === o.recipeId)).toBe(false);
    }
  });

  it('respects never-show signals', () => {
    const { mp, recipes, days, history } = simulate(base, 1);
    const day = days[1]!;
    const first = swapOptions({ profile: mp.engine, history, recipes, day, index: 0, now: NOW });
    const banned = first.map((o) => o.recipeId);
    const again = swapOptions({
      profile: mp.engine,
      history: { ...history, signals: { neverShow: banned, moreLike: [] } },
      recipes,
      day,
      index: 0,
      now: NOW,
    });
    expect(again.some((o) => banned.includes(o.recipeId))).toBe(false);
  });
});

describe('rebalance (engine portion solver)', () => {
  const { recipes } = simulate(base, 1);
  const two = recipes.filter((r) => r.slots.includes('dinner')).slice(0, 2).map((recipe) => ({ recipe }));

  it('shrinks portions when less is left and stays within bounds', () => {
    const big = rebalance(two, { kcal: 1600, protein: 120 });
    const small = rebalance(two, { kcal: 500, protein: 40 });
    const kcal = (s: number[]) => s.reduce((t, x, i) => t + x * two[i]!.recipe.perServing.kcal, 0);
    expect(kcal(small)).toBeLessThan(kcal(big));
    small.forEach((s, i) => {
      expect(s).toBeGreaterThanOrEqual(two[i]!.recipe.scalable.min - 1e-9);
      expect(s).toBeLessThanOrEqual(two[i]!.recipe.scalable.max + 1e-9);
      expect((s * 4) % 1).toBe(0); // 0.25 steps
    });
  });

  it('handles nothing left and nothing to rebalance', () => {
    expect(rebalance([], { kcal: 500, protein: 30 })).toEqual([]);
    const s = rebalance(two, { kcal: -300, protein: -10 });
    s.forEach((x, i) => expect(x).toBeCloseTo(Math.ceil(two[i]!.recipe.scalable.min * 4) / 4));
  });
});
