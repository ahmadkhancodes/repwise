/** Engine changes made while aligning with the content catalogue (D26, D27). */
import {
  CUISINE_GROUPS,
  EQUIPMENT_PRESETS,
  FILLER_SLOTS,
  countsAsProteinSource,
  cuisineMatches,
  dislikedIngredients,
  equipmentOk,
  isStaple,
  proteinAlternatives,
  recipeCandidates,
  recipeConstraints,
  slotDef,
  ProfileSchema,
} from '../src';
import { catalogues } from './fixtures/profiles';

describe('equipment', () => {
  test('a mat is never required; bodyweight needs nothing', () => {
    expect(equipmentOk({ equipment: ['bodyweight', 'mat'] }, [])).toBe(true);
    expect(equipmentOk({ equipment: ['mat'] }, ['dumbbell'])).toBe(true);
    expect(equipmentOk({ equipment: ['band', 'mat'] }, [])).toBe(false);
  });

  test('cardio_machine covers each machine; specific machines do not cover each other', () => {
    for (const m of ['treadmill', 'bike', 'rower', 'elliptical', 'stair_climber'] as const) {
      expect(equipmentOk({ equipment: [m] }, ['cardio_machine'])).toBe(true);
    }
    expect(equipmentOk({ equipment: ['rower'] }, ['treadmill'])).toBe(false);
  });

  test('presets parse as profile equipment', () => {
    for (const eq of Object.values(EQUIPMENT_PRESETS)) {
      expect(ProfileSchema.shape.equipment.parse([...eq])).toEqual([...eq]);
    }
  });
});

describe('cuisines', () => {
  test('a fine preference matches its catalogue group and back', () => {
    expect(cuisineMatches('arab', 'gulf')).toBe(true);
    expect(cuisineMatches('gulf', 'arab')).toBe(true);
    expect(cuisineMatches('japanese', 'east_asian')).toBe(true);
    expect(cuisineMatches('italian', 'italian')).toBe(true);
    expect(cuisineMatches('italian', 'mediterranean')).toBe(false);
    expect(cuisineMatches('japanese', 'korean')).toBe(false);
    expect(Object.keys(CUISINE_GROUPS).length).toBeGreaterThan(5);
  });

  test('recipe pool honours group preferences', () => {
    const profile = ProfileSchema.parse({ goal: 'maintain', sex: 'male', birthYear: 1990, heightCm: 180, weightKg: 80, experience: 'beginner', daysPerWeek: 3, sessionMin: 45, cuisines: ['middle_eastern'] });
    const { pool } = recipeCandidates(catalogues.recipes, recipeConstraints(profile), 'lunch', new Set(), 1);
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every((r) => cuisineMatches('middle_eastern', r.cuisine))).toBe(true);
  });
});

describe('ingredients and protein sources', () => {
  test('dislikes and staples work with kebab-case ids', () => {
    const recipe = { ingredients: [{ id: 'chicken-breast', name: 'Chicken breast', grams: 100 }, { id: 'olive-oil', name: 'Olive oil', grams: 5 }] };
    expect(dislikedIngredients(recipe, ['chicken breast'])).toEqual(['chicken-breast']);
    expect(dislikedIngredients(recipe, ['chicken_breast'])).toEqual(['chicken-breast']);
    expect(isStaple('olive-oil')).toBe(true);
    expect(isStaple('olive_oil')).toBe(true);
    expect(isStaple('oilseed-cake')).toBe(false);
  });

  test("'none' and 'grains' are exempt from the once-a-day rule", () => {
    expect(countsAsProteinSource('none')).toBe(false);
    expect(countsAsProteinSource('grains')).toBe(false);
    expect(countsAsProteinSource('soy')).toBe(true);
    expect(countsAsProteinSource('pork')).toBe(true);
  });

  test('protein alternatives stay in 1.6–2.2 g/kg, nearest first', () => {
    expect(proteinAlternatives(2.0)).toEqual([1.8, 2.2, 1.6]);
    expect(proteinAlternatives(1.6)).toEqual([1.8, 2, 2.2]);
    expect(proteinAlternatives(1.8)).toEqual([1.6, 2, 2.2]);
  });
});

test('filler slots are core accessories and resolve by key', () => {
  for (const s of FILLER_SLOTS) {
    expect(s).toMatchObject({ pattern: 'core', role: 'accessory' });
    expect(slotDef('upper_a', s.key)).toEqual(s);
  }
  expect(slotDef('upper_a', 'push_h_main')?.pattern).toBe('push_h');
  expect(slotDef('upper_a', 'nope')).toBeUndefined();
});
