/* eslint-disable @typescript-eslint/no-require-imports */
import {
  toEngineCatalogues,
  type Exercise as ContentExercise,
  type Food,
  type Recipe as ContentRecipe,
} from '@repwise/content';

import * as facade from '../engine';
import { decideAiPlan, looksLikeWeekPlan } from '../logic/aiPlan';
import { MAX_GOAL_WEEKS, projectGoalDate } from '../logic/goalDate';
import { buildHistory } from '../logic/history';
import { fillEmptyDays, planToRows, repsLabel } from '../logic/planRows';
import { budgetTier, spreadWeekdays, toEngineProfile, type ProfileRow } from '../logic/profile';

const engine = require('@repwise/engine');
const content = {
  exercises: require('@repwise/content/exercises.json') as ContentExercise[],
  recipes: require('@repwise/content/recipes.json') as ContentRecipe[],
  foods: require('@repwise/content/foods.json') as Food[],
};

describe('engine re-export', () => {
  it('mirrors the engine vocabularies', () => {
    for (const k of [
      'GOALS',
      'SEXES',
      'EXPERIENCE',
      'LIFESTYLES',
      'DIET_TYPES',
      'EQUIPMENT',
      'INJURIES',
      'ALLERGENS',
      'CUISINES',
    ] as const) {
      expect([...(facade as unknown as Record<string, string[]>)[k]!]).toEqual([...engine[k]]);
    }
    expect(facade.EXPECTED_WEEKLY_RATE).toEqual(engine.EXPECTED_WEEKLY_RATE);
    expect(typeof facade.planWeek).toBe('function');
  });
});

describe('content → engine catalogues', () => {
  const cat = toEngineCatalogues(content);

  it('every item the adapter keeps satisfies the engine contract', () => {
    expect(() => engine.ExerciseCatalogueSchema.parse(cat.exercises)).not.toThrow();
    expect(() => engine.RecipeCatalogueSchema.parse(cat.recipes)).not.toThrow();
    expect(cat.recipes).toHaveLength(content.recipes.length);
    expect(cat.exercises.length + cat.excluded.length).toBe(content.exercises.length);
  });

  it('EQUIPMENT_PRESETS only use profile equipment values', () => {
    for (const kit of Object.values(facade.EQUIPMENT_PRESETS)) {
      for (const q of kit) expect(facade.EQUIPMENT).toContain(q);
    }
  });
});

const row = (over: Partial<ProfileRow> = {}): ProfileRow =>
  ({
    id: 'p',
    userId: null,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    dirty: 1,
    name: null,
    goal: 'fat_loss',
    sex: 'female',
    birthYear: 1994,
    heightCm: 165,
    weightKg: 70,
    targetKg: 64,
    experience: 'beginner',
    days: 3,
    sessionMin: 45,
    equipment: ['dumbbell', 'bench', 'bogus'],
    injuries: ['knee'],
    dietType: 'halal',
    allergies: ['nuts', 'celery', 'bogus'],
    dislikes: ['olives', ' '],
    cuisines: ['pakistani', 'gulf', 'nope'],
    budget: '1',
    cookMin: 20,
    mealsPerDay: 4,
    mealTimes: null,
    units: 'metric',
    theme: null,
    activityLevel: 'moderate',
    timezone: null,
    locale: null,
    onboardedAt: null,
    ...over,
  }) as ProfileRow;

describe('toEngineProfile', () => {
  it('maps a complete row and filters unknown values', () => {
    const p = toEngineProfile(row(), { trainingWeekdays: [0, 2, 4] })!;
    expect(p).toMatchObject({
      goal: 'fat_loss',
      daysPerWeek: 3,
      trainingWeekdays: [0, 2, 4],
      equipment: ['dumbbell', 'bench'],
      allergies: ['nuts', 'celery'],
      dislikes: ['olives'],
      cuisines: ['pakistani', 'gulf'],
      budget: 1,
      lifestyle: 'moderate',
      targetKg: 64,
    });
    expect(() => engine.ProfileSchema.parse(p)).not.toThrow();
  });

  it('returns null while required answers are missing', () => {
    expect(toEngineProfile(undefined)).toBeNull();
    expect(toEngineProfile(row({ goal: null }))).toBeNull();
    expect(toEngineProfile(row({ weightKg: null }))).toBeNull();
  });

  it('ignores weekdays that do not match the day count', () => {
    expect(toEngineProfile(row(), { trainingWeekdays: [1, 2] })!.trainingWeekdays).toBeUndefined();
  });

  it('budget tiers default to mid', () => {
    expect(budgetTier('3')).toBe(3);
    expect(budgetTier(null)).toBe(2);
  });
});

describe('spreadWeekdays', () => {
  it('starts on the given weekday and spreads evenly', () => {
    expect(spreadWeekdays(3, 0)).toEqual([0, 2, 5]);
    expect(spreadWeekdays(3, 3)).toEqual([1, 3, 5]);
    expect(spreadWeekdays(4, 6)).toEqual([1, 3, 4, 6]);
  });
  it.each([2, 3, 4, 5, 6])('always returns %i distinct days', (n) => {
    for (let s = 0; s < 7; s++) {
      const d = spreadWeekdays(n, s);
      expect(new Set(d).size).toBe(n);
      expect(d).toContain(s);
    }
  });
});

describe('buildHistory', () => {
  it('turns rows into engine history and skips skipped items', () => {
    const h = buildHistory({
      sessions: [
        { id: 's1', date: '2026-11-10', status: 'done' },
        { id: 's2', date: '2026-11-12', status: 'skipped' },
      ],
      sessionExercises: [
        { id: 'a', sessionId: 's1', exerciseId: 'squat', position: 1 },
        { id: 'b', sessionId: 's1', exerciseId: 'bench', position: 0 },
        { id: 'c', sessionId: 's2', exerciseId: 'row', position: 0 },
      ],
      sets: [
        { sessionExerciseId: 'a', type: 'working', weightKg: 60, reps: 8, rpe: 8, doneAt: 5 },
        { sessionExerciseId: 'a', type: 'weird', weightKg: null, reps: null, rpe: 12, doneAt: 6 },
        { sessionExerciseId: 'b', type: 'working', weightKg: 40, reps: 5, rpe: null, doneAt: null },
      ],
      meals: [
        { date: '2026-11-10', slot: 'lunch', recipeId: 'r1', status: 'eaten' },
        { date: '2026-11-10', slot: 'dinner', recipeId: 'r2', status: 'skipped' },
      ],
      weights: [
        { date: '2026-11-10', weightKg: 70 },
        { date: '2026-11-11', weightKg: null },
      ],
    });
    expect(h.sessions).toEqual([{ date: '2026-11-10', exerciseIds: ['bench', 'squat'] }]);
    expect(h.sets).toEqual([
      { exerciseId: 'squat', doneAt: 5, type: 'working', weightKg: 60, reps: 8, rpe: 8 },
      { exerciseId: 'squat', doneAt: 6, type: 'working', weightKg: 0, reps: 0 },
    ]);
    expect(h.meals).toEqual([{ date: '2026-11-10', slot: 'lunch', recipeId: 'r1' }]);
    expect(h.weights).toEqual([{ date: '2026-11-10', kg: 70 }]);
    expect(() => engine.HistorySchema.parse(h)).not.toThrow();
  });
});

const meal = (recipeId: string) => ({
  slot: 'lunch' as const,
  recipeId,
  servings: 1,
  kcal: 500,
  protein: 40,
  carbs: 50,
  fat: 15,
});
const day = (date: string, dayType: 'training' | 'rest', meals: ReturnType<typeof meal>[]) => ({
  date,
  dayType,
  targets: { kcal: 2000, protein: 150, carbs: 200, fat: 60 },
  meals,
  totals: { kcal: meals.length * 500, protein: 0, carbs: 0, fat: 0 },
});

describe('planRows', () => {
  it('repsLabel shows a range or a single target', () => {
    expect(repsLabel([8, 12], 10)).toBe('8-12');
    expect(repsLabel([5, 5], 5)).toBe('5');
    expect(repsLabel([0, 0], 12)).toBe('0');
  });

  it('fills empty days from the nearest day of the same type', () => {
    const { days, filled } = fillEmptyDays([
      day('2026-11-16', 'training', [meal('a')]),
      day('2026-11-17', 'rest', [meal('b')]),
      day('2026-11-18', 'training', []),
      day('2026-11-19', 'rest', []),
    ]);
    expect(filled).toEqual(['2026-11-18', '2026-11-19']);
    expect(days[2]!.meals[0]!.recipeId).toBe('a');
    expect(days[3]!.meals[0]!.recipeId).toBe('b');
  });

  it('leaves days empty when nothing can be copied', () => {
    expect(fillEmptyDays([day('2026-11-16', 'rest', [])]).filled).toEqual([]);
  });
});

describe('planToRows with a real engine plan', () => {
  const cat = toEngineCatalogues(content);
  const profile = toEngineProfile(row({ dietType: 'omnivore', allergies: [], cuisines: [] }), {
    trainingWeekdays: [3, 5, 6],
  })!;
  const plan = facade.planWeek(profile, {}, cat, {
    now: Date.UTC(2026, 10, 19, 9),
    weekStart: '2026-11-19',
  });

  it('only writes dates from today and skips touched dates', () => {
    const rows = planToRows(plan, {
      fromDate: '2026-11-19',
      trainingWeekdays: [3, 5, 6],
      keepMealDates: new Set(['2026-11-20']),
    });
    expect(rows.weekStart).toBe('2026-11-16');
    expect(rows.sessions.map((s) => s.date)).toEqual(['2026-11-19', '2026-11-21', '2026-11-22']);
    expect(rows.mealPlans.map((d) => d.date)).toEqual(['2026-11-19', '2026-11-21', '2026-11-22']);
    expect(rows.training.trainingWeekdays).toEqual([3, 5, 6]);
    expect(rows.nutrition.days).toHaveLength(7);
    const s = rows.sessions[0]!;
    expect(s.exercises.length).toBeGreaterThan(0);
    expect(s.exercises.map((e) => e.position)).toEqual(s.exercises.map((_, i) => i));
    for (const d of rows.mealPlans) {
      expect(d.kcalTarget).toBeGreaterThan(1000);
      expect(d.meals.length).toBeGreaterThan(0);
    }
  });

  it('accepts a valid AI plan for the right week only', () => {
    const res = { source: 'ai', plan: plan as unknown };
    expect(looksLikeWeekPlan(plan)).toBe(true);
    expect(decideAiPlan(res, '2026-11-16', () => true)).toEqual({ accept: true, plan });
    expect(decideAiPlan(res, '2026-11-23', () => true)).toEqual({
      accept: false,
      reason: 'wrong_week',
    });
    expect(decideAiPlan(res, '2026-11-16', () => false)).toEqual({
      accept: false,
      reason: 'invalid',
    });
    expect(
      decideAiPlan(res, '2026-11-16', () => {
        throw new Error('boom');
      }),
    ).toEqual({ accept: false, reason: 'invalid' });
  });
});

describe('decideAiPlan', () => {
  it('keeps the rules plan for rules answers and junk', () => {
    expect(decideAiPlan(null, '2026-11-16', () => true).accept).toBe(false);
    expect(decideAiPlan({ source: 'rules', plan: null }, '2026-11-16', () => true)).toEqual({
      accept: false,
      reason: 'rules_only',
    });
    expect(
      decideAiPlan({ source: 'ai', plan: { sessions: 'x' } }, '2026-11-16', () => true),
    ).toEqual({
      accept: false,
      reason: 'bad_shape',
    });
  });
});

describe('projectGoalDate', () => {
  it('uses the engine weekly rate', () => {
    // 80 kg, −0.5 %/week = 0.4 kg/week → 10 kg = 25 weeks
    expect(
      projectGoalDate({ goal: 'fat_loss', weightKg: 80, targetKg: 70, today: '2026-11-19' }),
    ).toEqual({
      date: '2027-05-13',
      weeks: 25,
    });
    // 60 kg, +0.25 %/week = 0.15 kg/week → 3 kg = 20 weeks
    expect(
      projectGoalDate({ goal: 'muscle_gain', weightKg: 60, targetKg: 63, today: '2026-11-19' })
        ?.weeks,
    ).toBe(20);
  });

  it('is null for maintain, wrong direction, no target or too far away', () => {
    expect(
      projectGoalDate({ goal: 'maintain', weightKg: 80, targetKg: 70, today: '2026-11-19' }),
    ).toBeNull();
    expect(
      projectGoalDate({ goal: 'fat_loss', weightKg: 80, targetKg: 85, today: '2026-11-19' }),
    ).toBeNull();
    expect(
      projectGoalDate({ goal: 'fat_loss', weightKg: 80, targetKg: null, today: '2026-11-19' }),
    ).toBeNull();
    expect(
      projectGoalDate({ goal: 'muscle_gain', weightKg: 60, targetKg: 90, today: '2026-11-19' }),
    ).toBeNull();
    expect(MAX_GOAL_WEEKS).toBe(104);
  });
});
