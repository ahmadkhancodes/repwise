import {
  addDays,
  appendPlanToHistory,
  buildContext,
  planWeek,
  sessionFingerprint,
  validateDays,
  validatePlan,
  validateSessions,
  type DayMealPlan,
  type PlannedSession,
  type ValidationCode,
  type WeekPlan,
} from '../src';
import { catalogues, cutFemale, gymMale, NOW, WEEK } from './fixtures/profiles';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const codes = (errs: { code: ValidationCode }[]) => [...new Set(errs.map((e) => e.code))];

describe('validator', () => {
  const ctx = buildContext(cutFemale, {}, catalogues, { now: NOW, weekStart: WEEK });
  const plan: WeekPlan = planWeek(cutFemale, {}, catalogues, { now: NOW, weekStart: WEEK });
  // the validator must use the same (feasible) context the planner produced
  ctx.volumeRange = plan.volumeRange;
  ctx.noRepeatDays = plan.noRepeatDays;

  const withSession = (mut: (s: PlannedSession[]) => void) => {
    const s = clone(plan.sessions);
    mut(s);
    s.forEach((x) => (x.fingerprint = sessionFingerprint(x.items.map((i) => i.exerciseId))));
    return codes(validateSessions(ctx, s).errors);
  };
  const withDays = (mut: (d: DayMealPlan[]) => void) => {
    const d = clone(plan.days);
    mut(d);
    return codes(validateDays(ctx, d).errors);
  };

  test('the rules plan validates', () => {
    expect(validatePlan(ctx, plan)).toEqual({ ok: true, errors: [] });
  });

  test('unknown exercise', () => {
    expect(withSession((s) => (s[0]!.items[0]!.exerciseId = 'made_up'))).toContain('unknown_exercise');
  });

  test('equipment / injury / level / never-show', () => {
    const home = buildContext({ ...cutFemale, equipment: ['bodyweight'], injuries: ['shoulder'] }, { signals: { neverShow: ['plank'], moreLike: [] } }, catalogues, { now: NOW, weekStart: WEEK });
    const s = clone(plan.sessions);
    s[0]!.items[0]!.exerciseId = 'bench_press'; // barbell + shoulder contraindication
    s[0]!.items[1]!.exerciseId = 'front_squat'; // level 3 for a beginner
    s[0]!.items[2]!.exerciseId = 'plank';
    s[0]!.fingerprint = sessionFingerprint(s[0]!.items.map((i) => i.exerciseId));
    const c = codes(validateSessions(home, s).errors);
    expect(c).toEqual(expect.arrayContaining(['equipment_unavailable', 'injury_conflict', 'level_too_high', 'never_show']));
  });

  test('duplicate exercise, bad prescription, empty session, outside week', () => {
    expect(withSession((s) => (s[0]!.items[1]!.exerciseId = s[0]!.items[0]!.exerciseId))).toContain('duplicate_exercise');
    expect(withSession((s) => (s[0]!.items[0]!.sets = 0))).toContain('invalid_prescription');
    expect(withSession((s) => (s[0]!.items[0]!.repRange = [10, 5]))).toContain('invalid_prescription');
    expect(withSession((s) => (s[0]!.items = []))).toContain('empty_session');
    expect(withSession((s) => (s[0]!.date = addDays(WEEK, 30)))).toContain('session_outside_week');
    expect(withSession((s) => (s[1]!.date = s[0]!.date))).toContain('duplicate_session_date');
  });

  test('fingerprint mismatch', () => {
    const s = clone(plan.sessions);
    s[0]!.fingerprint = 'fp_bogus';
    expect(codes(validateSessions(ctx, s).errors)).toContain('fingerprint_mismatch');
  });

  test('fingerprint repeat + consecutive variant repeat against history', () => {
    const prevWeek = addDays(WEEK, -7);
    const fake = clone(plan);
    fake.weekStart = prevWeek;
    fake.sessions.forEach((s) => (s.date = addDays(s.date, -7)));
    fake.days = [];
    const h = appendPlanToHistory({}, fake);
    const ctx2 = buildContext(cutFemale, { ...h, block: undefined }, catalogues, { now: NOW, weekStart: WEEK });
    ctx2.volumeRange = plan.volumeRange;
    const c = codes(validateSessions(ctx2, plan.sessions).errors);
    expect(c).toEqual(expect.arrayContaining(['fingerprint_repeat', 'consecutive_variant_repeat']));
  });

  test('volume above / below range', () => {
    expect(withSession((s) => s.forEach((x) => x.items.forEach((i) => (i.sets = 8))))).toContain('volume_above_range');
    expect(withSession((s) => s.forEach((x) => (x.items = x.items.slice(0, 1))))).toContain('volume_below_range');
  });

  test('allergen, diet, dislike, unknown recipe, slot mismatch', () => {
    const nutty = catalogues.recipes.find((r) => r.allergens.includes('nuts') && r.slots.includes('lunch'));
    const allergenRecipe = nutty ?? catalogues.recipes.find((r) => r.allergens.includes('shellfish') && r.slots.includes('lunch'))!;
    expect(withDays((d) => (d[0]!.meals[1]!.recipeId = allergenRecipe.id))).toContain('allergen');
    expect(withDays((d) => (d[0]!.meals[1]!.recipeId = 'nope'))).toContain('unknown_recipe');
    const breakfast = catalogues.recipes.find((r) => r.slots.includes('breakfast') && !r.slots.includes('dinner'))!;
    expect(withDays((d) => (d[0]!.meals[2]!.recipeId = breakfast.id))).toContain('slot_mismatch');
    const veganCtx = buildContext({ ...cutFemale, dietType: 'vegan', dislikes: ['rice'] }, {}, catalogues, { now: NOW, weekStart: WEEK });
    const chicken = catalogues.recipes.find((r) => r.id === 'arab_chicken_breast_rice')!;
    const d = clone(plan.days);
    d[0]!.meals[1] = { ...d[0]!.meals[1]!, recipeId: chicken.id };
    expect(codes(validateDays(veganCtx, d).errors)).toEqual(expect.arrayContaining(['diet_mismatch', 'disliked_ingredient']));
  });

  test('kcal / protein out of range, portion bounds, macro mismatch', () => {
    expect(withDays((d) => d[0]!.meals.forEach((m) => (m.servings *= 1.3)))).toEqual(expect.arrayContaining(['kcal_out_of_range', 'macro_mismatch']));
    expect(withDays((d) => (d[0]!.meals[0]!.servings = 10))).toContain('portion_out_of_bounds');
    expect(withDays((d) => (d[0]!.meals = d[0]!.meals.slice(0, 1)))).toEqual(expect.arrayContaining(['kcal_out_of_range', 'protein_out_of_range']));
  });

  test('protein source repeat and no-repeat window', () => {
    expect(withDays((d) => (d[1]!.meals[1] = clone(d[0]!.meals[1]!)))).toContain('recipe_repeat_window');
    const chickenA = catalogues.recipes.find((r) => r.id === 'arab_chicken_breast_rice')!;
    const chickenB = catalogues.recipes.find((r) => r.id === 'indian_chicken_breast_rice')!;
    const c = withDays((d) => {
      d[0]!.meals[1] = { ...d[0]!.meals[1]!, recipeId: chickenA.id };
      d[0]!.meals[2] = { ...d[0]!.meals[2]!, recipeId: chickenB.id };
    });
    expect(c).toContain('protein_source_repeat');
  });

  test('days outside the week', () => {
    expect(withDays((d) => (d[0]!.date = addDays(WEEK, -1)))).toContain('day_outside_week');
  });

  test('typed errors carry details', () => {
    const d = clone(plan.days);
    d[0]!.meals[0]!.recipeId = 'nope';
    const err = validateDays(ctx, d).errors.find((e) => e.code === 'unknown_recipe');
    expect(err).toEqual({ code: 'unknown_recipe', date: WEEK, recipeId: 'nope' });
  });

  test('gym profile plan validates under an independently built context', () => {
    const p = planWeek(gymMale, {}, catalogues, { now: NOW, weekStart: WEEK });
    const c = buildContext(gymMale, {}, catalogues, { now: NOW, weekStart: WEEK });
    c.volumeRange = p.volumeRange;
    c.noRepeatDays = p.noRepeatDays;
    expect(validatePlan(c, p).ok).toBe(true);
  });
});
