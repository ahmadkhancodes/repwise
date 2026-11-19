import {
  FINGERPRINT_WINDOW,
  blockedRecipes,
  clampNoRepeatDays,
  consecutiveRepeats,
  countsAsProteinSource,
  exerciseWeight,
  fingerprintIsFresh,
  isStaple,
  lastVariantsByPattern,
  likedTraits,
  proteinShare,
  recipeWeight,
  sessionFingerprint,
  sharedIngredientCount,
} from '../src';
import { exercises } from './fixtures/exercises';
import { recipes } from './fixtures/recipes';

const R = (id: string) => recipes.find((r) => r.id === id)!;

describe('session uniqueness', () => {
  test('fingerprint = hash of ORDERED ids', () => {
    expect(sessionFingerprint(['a', 'b'])).toBe(sessionFingerprint(['a', 'b']));
    expect(sessionFingerprint(['a', 'b'])).not.toBe(sessionFingerprint(['b', 'a']));
    expect(sessionFingerprint(['a', 'b'])).toMatch(/^fp_[0-9a-f]{14}$/);
  });

  test('fresh against the last 10 only', () => {
    const fps = Array.from({ length: 12 }, (_, i) => `fp_${i}`);
    expect(FINGERPRINT_WINDOW).toBe(10);
    expect(fingerprintIsFresh('fp_1', fps)).toBe(true); // 11 sessions ago
    expect(fingerprintIsFresh('fp_2', fps)).toBe(false);
    expect(fingerprintIsFresh('fp_x', fps)).toBe(true);
  });

  test('consecutive non-main variants per pattern key; mains exempt', () => {
    const sessions = [
      { exerciseIds: ['back_squat', 'lateral_raise', 'dumbbell_curl'], patternKeys: ['squat', 'isolation:side_delts', 'isolation:biceps'], mainExerciseIds: ['back_squat'] },
      { exerciseIds: ['deadlift', 'cable_curl'], patternKeys: ['hinge', 'isolation:biceps'], mainExerciseIds: ['deadlift'] },
    ];
    const last = lastVariantsByPattern(sessions);
    expect([...(last.get('isolation:biceps') ?? [])]).toEqual(['cable_curl']);
    expect([...(last.get('isolation:side_delts') ?? [])]).toEqual(['lateral_raise']);
    expect(last.has('squat')).toBe(false);
    expect(consecutiveRepeats({ exerciseIds: ['back_squat', 'cable_curl', 'lateral_raise'], patternKeys: ['squat', 'isolation:biceps', 'isolation:side_delts'], mainExerciseIds: ['back_squat'] }, last)).toEqual([
      'cable_curl',
      'lateral_raise',
    ]);
    expect(consecutiveRepeats({ exerciseIds: ['dumbbell_curl'], patternKeys: ['isolation:biceps'] }, last)).toEqual([]);
  });

  test('exercise weights: more-like-this up, recent use down', () => {
    const e = exercises[0]!;
    const base = exerciseWeight(e, { moreLike: new Set() });
    expect(exerciseWeight(e, { moreLike: new Set([e.id]) })).toBe(base * 3);
    expect(exerciseWeight(e, { moreLike: new Set(), likedMuscles: new Set(e.primaryMuscles) })).toBeCloseTo(base * 1.3, 9);
    expect(exerciseWeight(e, { moreLike: new Set(), recentUse: new Map([[e.id, 2]]) })).toBeCloseTo(base / 3, 9);
  });
});

describe('meal uniqueness', () => {
  test('no-repeat window default 14, clamp 7–30', () => {
    expect(clampNoRepeatDays(undefined)).toBe(14);
    expect(clampNoRepeatDays(3)).toBe(7);
    expect(clampNoRepeatDays(45)).toBe(30);
    expect(clampNoRepeatDays(10.4)).toBe(10);
    expect(clampNoRepeatDays(NaN)).toBe(14);
  });

  test('blocked within |Δ| < window days (13 blocked, 14 free)', () => {
    const meals = [{ date: '2026-11-01', recipeId: 'a' }, { date: '2026-11-10', recipeId: 'b' }, { date: '2026-11-28', recipeId: 'c' }];
    const b = blockedRecipes(meals, '2026-11-15', 14);
    expect(b.has('a')).toBe(false); // 14 days
    expect(b.has('b')).toBe(true);
    expect(b.has('c')).toBe(true); // 13 days later (planned future)
    expect(blockedRecipes(meals, '2026-11-14', 14).has('a')).toBe(true);
  });

  test('protein source rule exempts "none"; staples ignored for re-use', () => {
    expect(countsAsProteinSource('none')).toBe(false);
    expect(countsAsProteinSource('chicken')).toBe(true);
    expect(isStaple('olive_oil')).toBe(true);
    expect(isStaple('spice_mix')).toBe(true);
    expect(isStaple('chicken_breast')).toBe(false);
    expect(isStaple('pepperoni')).toBe(false);
  });

  test('recipe weights: more-like-this, cuisine rotation, grocery re-use, protein share', () => {
    const r = R('arab_chicken_breast_rice');
    const base = recipeWeight(r, { moreLike: new Set() });
    expect(recipeWeight(r, { moreLike: new Set([r.id]) })).toBe(base * 3);
    expect(recipeWeight(r, { moreLike: new Set(), previousCuisine: 'arab' })).toBeCloseTo(base * 0.35, 9);
    expect(recipeWeight(r, { moreLike: new Set(), preferredCuisines: ['arab'] })).toBeCloseTo(base * 1.5, 9);
    const reuse = recipeWeight(r, { moreLike: new Set(), ingredientUse: new Map([['chicken_breast', 1], ['rice', 2], ['olive_oil', 1]]) });
    expect(reuse).toBeCloseTo(base * 1.5, 9);
    const overused = recipeWeight(r, { moreLike: new Set(), ingredientUse: new Map([['chicken_breast', 3]]) });
    expect(overused).toBe(base);
    const lean = recipeWeight(r, { moreLike: new Set(), proteinShareTarget: proteinShare(r) });
    const off = recipeWeight(r, { moreLike: new Set(), proteinShareTarget: proteinShare(r) + 0.3 });
    expect(lean).toBeGreaterThan(off * 10);
  });

  test('liked traits + shared ingredient metric', () => {
    const byId = new Map(recipes.map((r) => [r.id, r]));
    const t = likedTraits(new Set(['arab_chicken_breast_rice', 'nope']), byId);
    expect([...t.cuisines]).toEqual(['arab']);
    expect([...t.sources]).toEqual(['chicken']);
    expect(sharedIngredientCount([R('arab_chicken_breast_rice'), R('arab_beef_lean_rice'), R('thai_tofu_rice_noodles')])).toBeGreaterThanOrEqual(3);
  });
});
