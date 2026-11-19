/**
 * Bible acceptance (RW-11, RW-31) on the REAL catalogues from @repwise/content via the toEngine
 * adapter, not on the generated fixtures. Known content gaps are pinned in CONTENT_GAPS: those
 * profiles must still pass every safety rule, and the test fails once content closes the gap
 * (so the entry gets removed).
 */
import { engineCatalogues } from '@repwise/content';
import {
  EQUIPMENT_PRESETS,
  ExerciseCatalogueSchema,
  RecipeCatalogueSchema,
  addDays,
  appendPlanToHistory,
  countsAsProteinSource,
  dietOk,
  equipmentOk,
  exercisePatternKey,
  injuryOk,
  planWeek,
  type Catalogues,
  type HistoryInput,
  type ProfileInput,
  type WeekPlan,
} from '../src';

const real = engineCatalogues();
const catalogues: Catalogues = { exercises: real.exercises, recipes: real.recipes };
const exById = new Map(catalogues.exercises.map((e) => [e.id, e]));
const recipeById = new Map(catalogues.recipes.map((r) => [r.id, r]));
const NOW = Date.UTC(2026, 10, 23, 8, 0, 0);
const WEEK = '2026-11-23';
const DAY = 86_400_000;

function simulate(profile: ProfileInput, weeks: number): WeekPlan[] {
  const plans: WeekPlan[] = [];
  let h: HistoryInput = {};
  for (let w = 0; w < weeks; w++) {
    const plan = planWeek(profile, h, catalogues, { now: NOW + w * 7 * DAY, weekStart: addDays(WEEK, 7 * w) });
    plans.push(plan);
    h = appendPlanToHistory(h, plan);
  }
  return plans;
}

const person = (p: Partial<ProfileInput>): ProfileInput => ({
  goal: 'muscle_gain',
  sex: 'male',
  birthYear: 1994,
  heightCm: 180,
  weightKg: 80,
  experience: 'intermediate',
  daysPerWeek: 4,
  sessionMin: 60,
  equipment: [...EQUIPMENT_PRESETS.full_gym],
  mealsPerDay: 4,
  budget: 2,
  cookMin: 45,
  ...p,
});

test('the real catalogues parse with the engine schemas', () => {
  expect(ExerciseCatalogueSchema.safeParse(catalogues.exercises).success).toBe(true);
  expect(RecipeCatalogueSchema.safeParse(catalogues.recipes).success).toBe(true);
  expect(catalogues.exercises.length).toBeGreaterThanOrEqual(200);
  expect(catalogues.recipes.length).toBeGreaterThanOrEqual(240);
});

describe('real data: 60-session uniqueness (RW-11)', () => {
  const splits = [
    ['6-day PPL', { daysPerWeek: 6, sessionMin: 75, experience: 'advanced' }, 10],
    ['4-day upper/lower', { daysPerWeek: 4, sessionMin: 60, experience: 'intermediate' }, 15],
    ['3-day full body', { daysPerWeek: 3, sessionMin: 45, experience: 'beginner' }, 20],
  ] as const;
  const kits = [
    ['gym', EQUIPMENT_PRESETS.full_gym],
    ['home dumbbells', EQUIPMENT_PRESETS.home_dumbbells],
    ['bodyweight only', EQUIPMENT_PRESETS.bodyweight],
  ] as const;
  const cases = splits.flatMap(([s, p, weeks]) => kits.map(([k, eq]) => [`${s}, ${k}`, { ...p, equipment: [...eq] } as Partial<ProfileInput>, weeks] as const));

  test.each(cases)('%s: valid, no fingerprint repeat in a rolling 10, no consecutive variant repeat', (_n, p, weeks) => {
    const profile = person(p);
    const plans = simulate(profile, weeks);
    const sessions = plans.flatMap((x) => x.sessions);
    expect(sessions.length).toBeGreaterThanOrEqual(60);
    plans.forEach((x) => expect(x.validation.errors.filter((e) => !e.code.startsWith('kcal') && !e.code.startsWith('protein'))).toEqual([]));
    const fps = sessions.map((s) => s.fingerprint);
    fps.forEach((fp, i) => expect(fps.slice(Math.max(0, i - 10), i)).not.toContain(fp));
    const last = new Map<string, Set<string>>();
    for (const s of sessions) {
      expect(s.items.length).toBeGreaterThanOrEqual(3);
      const local = new Map<string, Set<string>>();
      for (const it of s.items) {
        const ex = exById.get(it.exerciseId)!;
        expect(equipmentOk(ex, profile.equipment ?? [])).toBe(true);
        expect(injuryOk(ex, profile.injuries ?? [])).toBe(true);
        if (it.role === 'main') continue;
        const key = exercisePatternKey(ex);
        expect(last.get(key)?.has(it.exerciseId) ?? false).toBe(false);
        if (!local.has(key)) local.set(key, new Set());
        local.get(key)!.add(it.exerciseId);
      }
      for (const [k, v] of local) last.set(k, v);
    }
  });
});

/**
 * Profiles the real recipes cannot serve fully yet (see docs/PROGRESS.md "Content gaps"). Their
 * days must pass every safety rule; macros are not asserted.
 * vegan: only 4 vegan breakfasts (a 7-day no-repeat window needs ≥ 7, the default 14-day window ≥ 14),
 * so breakfast is skipped on some days, and the best vegan lunch/dinner gets 26% of energy from
 * protein while a 1.6 g/kg target needs ≈ 22–30%, so portions sit at the top of their range and
 * some days miss protein.
 */
const CONTENT_GAPS = new Set(['vegan']);

describe('real data: 100+ generated days pass macro, allergen, diet and protein-source checks (RW-31)', () => {
  const profiles: Record<string, ProfileInput> = {
    vegetarian: person({ goal: 'fat_loss', sex: 'female', weightKg: 78, heightCm: 168, dietType: 'vegetarian', cuisines: ['italian', 'mexican'], budget: 2 }),
    halal: person({ goal: 'fat_loss', weightKg: 90, heightCm: 178, dietType: 'halal', cuisines: ['pakistani', 'arab'], budget: 1, mealsPerDay: 3, allergies: ['nuts'] }),
    halalGain: person({ goal: 'muscle_gain', weightKg: 70, heightCm: 175, dietType: 'halal', cuisines: ['middle_eastern', 'gulf'], budget: 3, mealsPerDay: 5 }),
    pescatarian: person({ goal: 'maintain', sex: 'female', weightKg: 62, heightCm: 165, dietType: 'pescatarian', cuisines: ['east_asian', 'japanese'], budget: 3, mealsPerDay: 3, allergies: ['dairy'] }),
    glutenFree: person({ goal: 'recomp', weightKg: 85, heightCm: 183, allergies: ['gluten'], cuisines: ['american', 'british'], budget: 2 }),
    omnivoreBudget: person({ goal: 'muscle_gain', weightKg: 100, heightCm: 190, budget: 1, cookMin: 20, mealsPerDay: 3 }),
    vegan: person({ goal: 'maintain', sex: 'female', weightKg: 65, heightCm: 168, dietType: 'vegan', cuisines: ['indian', 'mediterranean'], budget: 1, mealsPerDay: 3, allergies: ['peanut'] }),
  };
  const days = Object.entries(profiles).flatMap(([name, profile]) =>
    simulate(profile, 3).flatMap((plan) => plan.days.map((day) => ({ name, profile, plan, day }))),
  );

  test('at least 100 days on profiles without a content gap, across ≥ 6 cuisines and all 3 budgets', () => {
    expect(days.filter((d) => !CONTENT_GAPS.has(d.name)).length).toBeGreaterThanOrEqual(100);
    const cuisines = new Set(days.flatMap((d) => d.day.meals.map((m) => recipeById.get(m.recipeId)!.cuisine)));
    expect(cuisines.size).toBeGreaterThanOrEqual(6);
    expect(new Set(Object.values(profiles).map((p) => p.budget))).toEqual(new Set([1, 2, 3]));
  });

  test.each(days.map((d, i) => [i, d.name, d.day.date, d] as const))('#%i %s %s', (_i, name, _d, { profile, plan, day }) => {
    const target = day.dayType === 'training' ? plan.nutrition.training : plan.nutrition.rest;
    let kcal = 0;
    let protein = 0;
    const sources: string[] = [];
    expect(day.meals.length).toBeGreaterThan(0);
    for (const m of day.meals) {
      const r = recipeById.get(m.recipeId)!;
      expect(r).toBeDefined();
      kcal += r.perServing.kcal * m.servings;
      protein += r.perServing.protein * m.servings;
      for (const a of profile.allergies ?? []) expect(r.allergens).not.toContain(a);
      expect(dietOk(r, profile.dietType ?? 'omnivore')).toBe(true);
      expect(r.slots).toContain(m.slot);
      expect(m.servings).toBeGreaterThanOrEqual(r.scalable.min);
      expect(m.servings).toBeLessThanOrEqual(r.scalable.max);
      if (countsAsProteinSource(r.proteinSource)) sources.push(r.proteinSource);
    }
    expect(new Set(sources).size).toBe(sources.length);
    if (CONTENT_GAPS.has(name)) return;
    expect(Math.abs(kcal - target.kcal)).toBeLessThanOrEqual(target.kcal * 0.05 + 0.5);
    expect(Math.abs(protein - target.protein)).toBeLessThanOrEqual(10.05);
    expect(plan.nutrition.training.protein).toBeGreaterThanOrEqual(Math.floor(Math.min(profile.weightKg, 27 * (profile.heightCm / 100) ** 2) * 1.6));
  });

  test.each([...CONTENT_GAPS])('content gap still open for %s (remove it from CONTENT_GAPS once this fails)', (name) => {
    const own = days.filter((d) => d.name === name);
    const macroMiss = own.some((d) => d.plan.validation.errors.some((e) => e.code === 'kcal_out_of_range' || e.code === 'protein_out_of_range'));
    const mealSkipped = own.some((d) => d.plan.warnings.some((w) => w.code === 'slot_skipped' && w.date === d.day.date && /recipe/.test(w.message)));
    expect(macroMiss || mealSkipped).toBe(true);
  });

  test('halal profiles never get pork; halal tag = content halal_friendly', () => {
    for (const d of days.filter((x) => x.profile.dietType === 'halal')) for (const m of d.day.meals) expect(recipeById.get(m.recipeId)!.proteinSource).not.toBe('pork');
  });
});
