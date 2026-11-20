/**
 * Edge cases on the real catalogues (docs/ENGINE_QA.md): extreme bodies, 1 and 7 training days,
 * bodyweight only, narrow diets, 6 meals a day, empty candidate pools, corrupt inputs.
 * The app path (planWeekWithVariety / planWeek / planDay) must never throw and must explain gaps.
 */
import {
  ALLERGENS,
  KCAL_CEILING,
  computeTargets,
  planDay,
  planWeek,
  planWeekWithVariety,
  ProfileSchema,
  weeklyVolume,
  type ProfileInput,
  type WeekPlan,
} from '../src';
import { CATALOGUES, IX, NOW, WEEK } from './support/property';
import { checkMeals, checkNumbers, checkNutrition, checkSessions, missedGroups } from './support/invariants';

const base: ProfileInput = {
  goal: 'maintain',
  sex: 'male',
  birthYear: 1990,
  heightCm: 178,
  weightKg: 78,
  experience: 'intermediate',
  daysPerWeek: 4,
  sessionMin: 60,
  equipment: ['barbell', 'dumbbell', 'bench', 'cable', 'machine', 'pullup_bar', 'squat_rack'],
  mealsPerDay: 3,
};
const plan = (p: Partial<ProfileInput>, cat = CATALOGUES, extra: Record<string, unknown> = {}) =>
  planWeek({ ...base, ...p }, {}, cat, { now: NOW, weekStart: WEEK, ...extra });

function expectSound(profile: ProfileInput, w: WeekPlan) {
  expect(checkNumbers(w)).toEqual([]);
  expect(checkNutrition(profile, w)).toEqual([]);
  expect(checkMeals(profile, w, IX)).toEqual([]);
  expect(checkSessions(profile, w, IX)).toEqual([]);
}

describe('extreme bodies', () => {
  const bodies: [string, Partial<ProfileInput>][] = [
    ['shortest, lightest woman', { sex: 'female', heightCm: 120, weightKg: 30, goal: 'fat_loss' }],
    ['tallest, heaviest man', { heightCm: 230, weightKg: 300, goal: 'muscle_gain', lifestyle: 'active', daysPerWeek: 6 }],
    ['tall and very light', { heightCm: 230, weightKg: 30, goal: 'muscle_gain' }],
    ['short and very heavy', { sex: 'female', heightCm: 120, weightKg: 300, goal: 'fat_loss' }],
    ['aged 100', { birthYear: 1926, goal: 'fat_loss' }],
    ['aged 13 (general plan)', { birthYear: 2013, goal: 'fat_loss' }],
  ];
  test.each(bodies)('%s: sound plan, kcal inside floor..ceiling', (_n, p) => {
    const profile = { ...base, ...p };
    const w = plan(profile);
    expectSound(profile, w);
    expect(w.nutrition.training.kcal).toBeLessThanOrEqual(KCAL_CEILING);
  });

  test('a 300 kg, 230 cm man is capped at the ceiling (bug 2: was 8,280 kcal)', () => {
    const w = plan({ heightCm: 230, weightKg: 300, birthYear: 2008, goal: 'muscle_gain', lifestyle: 'active', daysPerWeek: 6 });
    expect(w.nutrition.base.kcal).toBe(KCAL_CEILING);
    expect(w.nutrition.flags).toContain('ceiling_applied');
  });

  test('under-16s get the general plan with the safety warning', () => {
    const w = plan({ birthYear: 2013, goal: 'fat_loss' });
    expect(w.nutrition.goal).toBe('maintain');
    expect(w.warnings.map((x) => x.code)).toContain('safety_general_plan');
  });
});

describe('weekly check-in deltas', () => {
  const t = (adj: number) => computeTargets(ProfileSchema.parse(base), WEEK, { adjustmentKcal: adj });
  test('NaN and ±Infinity are ignored (bug 2: NaN kcal broke every portion)', () => {
    expect(t(NaN).base.kcal).toBe(t(0).base.kcal);
    expect(t(Infinity).base.kcal).toBe(t(0).base.kcal);
    expect(t(-Infinity).base.kcal).toBe(t(0).base.kcal);
  });
  test('huge deltas clamp to floor..ceiling', () => {
    expect(t(1e6).base.kcal).toBe(KCAL_CEILING);
    expect(t(1e6).training.kcal).toBeLessThanOrEqual(KCAL_CEILING);
    expect(t(-1e6).base.kcal).toBe(t(-1e6).floor);
  });
});

describe('training days', () => {
  test('1 day: one full-body session that trains every group the kit allows (bug 4)', () => {
    const profile = { ...base, daysPerWeek: 1 };
    const w = plan(profile);
    expect(w.split).toBe('full_body');
    expect(w.sessions).toHaveLength(1);
    expect(w.sessions[0]!.templateKey).toBe('full_1');
    expect(missedGroups(profile, w, IX)).toEqual([]);
    expectSound(profile, w);
  });

  test('7 days: seven PPL sessions, no repeat, ≤ 20 sets per group', () => {
    const profile = { ...base, daysPerWeek: 7, equipment: [...CATALOGUES.exercises.flatMap((e) => e.equipment)] as ProfileInput['equipment'] };
    const w = plan(profile);
    expect(w.split).toBe('ppl');
    expect(w.sessions).toHaveLength(7);
    expect(new Set(w.sessions.map((s) => s.fingerprint)).size).toBe(7);
    for (const v of Object.values(weeklyVolume(w.sessions, IX.exById))) expect(v).toBeLessThanOrEqual(20);
    expect(w.validation.errors.filter((e) => !e.code.startsWith('kcal') && !e.code.startsWith('protein'))).toEqual([]);
  });

  test('6 × 20 min sessions never exceed 20 weekly sets for a group (bug 3)', () => {
    const w = plan({ daysPerWeek: 6, sessionMin: 20, experience: 'advanced', injuries: ['wrist'] });
    for (const v of Object.values(w.volume)) expect(v).toBeLessThanOrEqual(20);
  });

  test('bodyweight only (empty kit): every exercise needs nothing', () => {
    const profile = { ...base, equipment: [] };
    const w = plan(profile);
    expect(w.sessions.length).toBe(4);
    expectSound(profile, w);
  });
});

describe('diets and meals', () => {
  test('vegan + nut + gluten allergy: every meal is safe', () => {
    const profile: ProfileInput = { ...base, dietType: 'vegan', allergies: ['nuts', 'peanut', 'gluten'] };
    const w = plan(profile);
    expectSound(profile, w);
    for (const d of w.days) for (const m of d.meals) expect(IX.recipeById.get(m.recipeId)!.dietTags).toContain('vegan');
  });

  test('keto + halal (one diet type: keto, pork disliked): keto recipes only, never pork', () => {
    const profile: ProfileInput = { ...base, dietType: 'keto', dislikes: ['pork', 'bacon', 'ham', 'lard'] };
    const w = plan(profile);
    expectSound(profile, w);
    for (const d of w.days) for (const m of d.meals) {
      const r = IX.recipeById.get(m.recipeId)!;
      expect(r.dietTags).toContain('keto');
      expect(r.proteinSource).not.toBe('pork');
    }
  });

  test('6 meals a day: breakfast, lunch, dinner + 3 snacks, one protein source each', () => {
    const profile: ProfileInput = { ...base, mealsPerDay: 6, goal: 'muscle_gain' };
    const w = plan(profile);
    expectSound(profile, w);
    for (const d of w.days) expect(d.meals.length).toBeGreaterThanOrEqual(6);
  });
});

describe('empty candidate pools degrade with a clear reason (bug 2)', () => {
  test('no catalogues at all: no throw, no empty sessions, no_candidates warnings', async () => {
    const w = await planWeekWithVariety(base, {}, { exercises: [], recipes: [] }, { now: NOW, weekStart: WEEK });
    expect(w.sessions).toEqual([]);
    const codes = w.warnings.map((x) => x.code);
    expect(codes.filter((c) => c === 'no_candidates').length).toBe(2);
    expect(w.validation.errors.some((e) => e.code === 'empty_session')).toBe(false);
  });

  test('every recipe excluded (all 13 allergens, vegan): days are empty and explained', () => {
    const profile: ProfileInput = { ...base, dietType: 'vegan', allergies: [...ALLERGENS] };
    const w = plan(profile);
    expectSound(profile, w);
    for (const d of w.days) {
      if (d.meals.length > 0) continue;
      expect(w.warnings.some((x) => x.code === 'no_candidates' || (x.code === 'slot_skipped' && x.date === d.date))).toBe(true);
    }
  });

  test('never-show everything: no throw, no empty sessions', () => {
    const neverShow = [...CATALOGUES.exercises.map((e) => e.id), ...CATALOGUES.recipes.map((r) => r.id)];
    const w = planWeek(base, { signals: { neverShow, moreLike: [] } }, CATALOGUES, { now: NOW, weekStart: WEEK });
    expect(w.sessions).toEqual([]);
    expect(w.days.every((d) => d.meals.length === 0)).toBe(true);
    expect(w.warnings.filter((x) => x.code === 'no_candidates').length).toBe(2);
  });

  test('planDay on an empty catalogue returns a day without a session', () => {
    const d = planDay(base, {}, { exercises: [], recipes: [] }, { now: NOW, date: WEEK });
    expect(d.session).toBeNull();
    expect(d.meals.meals).toEqual([]);
  });
});
