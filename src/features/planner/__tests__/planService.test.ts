import { eq } from 'drizzle-orm';

import { resetDbForTests } from '@/db/client';
import { migrateDb } from '@/db/migrate';
import { setRowOwner } from '@/db/owner';
import { meals, plans } from '@/db/schema';
import { mealPlanForDate, mealsForPlan, mealsRepo, setMealStatus } from '@/features/meals/repo';
import { saveProfile } from '@/features/settings/repo';
import { exercisesForSession, sessionsForDate, startSession } from '@/features/workout/repo';
import { resetAnalyticsForTests, trackedEvents } from '@/services/analytics';

import { plansRepo } from '../repo';
import {
  applyExerciseSwap,
  applyMealSwap,
  ensureWeekPlanned,
  getEngineCatalogues,
  generateInitialPlan,
  localToday,
  planToday,
  regenerateWeek,
  swapExerciseOptions,
  swapMealOptions,
  upgradeWithAi,
  type AiFetcher,
} from '../planService';
import { planWeek, addDays, type WeekPlan } from '../engine';

// Thursday 19 Nov 2026, 09:00 local.
const NOW = new Date(2026, 10, 19, 9, 0, 0).getTime();
const TODAY = localToday(NOW);

function completeProfile(over: Parameters<typeof saveProfile>[0] = {}) {
  return saveProfile({
    goal: 'muscle_gain',
    sex: 'male',
    birthYear: 1995,
    heightCm: 180,
    weightKg: 78,
    targetKg: 82,
    experience: 'intermediate',
    days: 3,
    sessionMin: 60,
    equipment: [
      'barbell',
      'dumbbell',
      'cable',
      'machine',
      'bench',
      'pullup_bar',
      'bodyweight',
      'squat_rack',
    ],
    injuries: [],
    dietType: 'omnivore',
    allergies: ['peanut'],
    dislikes: [],
    cuisines: [],
    budget: '2',
    cookMin: 30,
    mealsPerDay: 3,
    units: 'metric',
    activityLevel: 'light',
    ...over,
  });
}

const noAi: AiFetcher = async () => null;

beforeEach(async () => {
  resetDbForTests();
  setRowOwner(null);
  await migrateDb();
  resetAnalyticsForTests();
});

describe('planService', () => {
  it('refuses to plan without a complete profile', async () => {
    await expect(regenerateWeek({ now: NOW, fetchAi: noAi })).rejects.toMatchObject({
      code: 'no_profile',
    });
    expect(ensureWeekPlanned(TODAY, NOW)).toBeNull();
    expect(planToday(TODAY, NOW)).toMatchObject({ session: null, mealPlan: null, meals: [] });
  });

  it('writes a real week from today: plans, sessions, exercises, meal plans and meals', async () => {
    completeProfile();
    const { first, next } = await generateInitialPlan({ now: NOW, fetchAi: noAi });
    expect(first.weekStart).toBe('2026-11-16');
    expect(first.source).toBe('rules');
    expect(next).toBeNull(); // Thursday: 4 days left this week
    expect(
      plansRepo
        .list(eq(plans.weekStart, '2026-11-16'))
        .map((p) => p.type)
        .sort(),
    ).toEqual(['nutrition', 'training']);
    // Training days are spread from today, so there is a workout today.
    const today = planToday(TODAY, NOW);
    expect(today.session?.title).toBeTruthy();
    expect(today.session?.status).toBe('planned');
    expect(today.exercises.length).toBeGreaterThanOrEqual(3);
    expect(today.exercises.every((e) => e.targetSets! > 0 && e.targetReps)).toBe(true);
    expect(today.mealPlan?.dayType).toBe('training');
    expect(today.mealPlan?.kcalTarget).toBeGreaterThan(1500);
    expect(today.meals.length).toBeGreaterThanOrEqual(3);
    // Nothing is written for the days already past.
    expect(sessionsForDate('2026-11-16')).toEqual([]);
    expect(mealPlanForDate('2026-11-17')).toBeUndefined();
    expect(mealPlanForDate('2026-11-22')).toBeDefined();
    expect(trackedEvents().some((e) => e.event === 'ai_plan_result')).toBe(true);
  });

  it('also plans next week when fewer than 4 days are left', async () => {
    completeProfile();
    const sat = new Date(2026, 10, 21, 9).getTime();
    const { first, next } = await generateInitialPlan({ now: sat, fetchAi: noAi });
    expect(first.weekStart).toBe('2026-11-16');
    expect(next?.weekStart).toBe('2026-11-23');
    expect(mealPlanForDate('2026-11-23')).toBeDefined();
  });

  it('regenerating keeps started workouts and eaten meals, replaces the rest', async () => {
    completeProfile();
    await regenerateWeek({ now: NOW, fetchAi: noAi });
    const session = sessionsForDate(TODAY)[0]!;
    startSession(session.id, NOW);
    const mp = mealPlanForDate('2026-11-20')!;
    const eaten = mealsForPlan(mp.id)[0]!;
    setMealStatus(eaten.id, 'eaten', NOW);
    const other = mealPlanForDate('2026-11-21')!;

    const again = await regenerateWeek({ now: NOW + 1000, fetchAi: noAi });
    expect(again.version).toBe(2);
    expect(sessionsForDate(TODAY).map((s) => s.id)).toEqual([session.id]);
    expect(mealPlanForDate('2026-11-20')!.id).toBe(mp.id);
    expect(mealsRepo.get(eaten.id)?.status).toBe('eaten');
    expect(mealPlanForDate('2026-11-21')!.id).not.toBe(other.id);
    // Soft-deleted rows are gone from reads but kept for sync.
    expect(mealsRepo.list(eq(meals.mealPlanId, other.id))).toEqual([]);
  });

  it('ensureWeekPlanned plans a missing week once', () => {
    completeProfile();
    const nextWeek = addDays('2026-11-16', 7);
    expect(ensureWeekPlanned(nextWeek, NOW)?.weekStart).toBe(nextWeek);
    expect(ensureWeekPlanned(nextWeek, NOW)).toBeNull();
  });

  describe('AI upgrade', () => {
    async function rulesWeek() {
      completeProfile();
      const result = await regenerateWeek({ now: NOW, ai: false });
      const profile = {
        goal: 'muscle_gain' as const,
        sex: 'male' as const,
        birthYear: 1995,
        heightCm: 180,
        weightKg: 78,
        targetKg: 82,
        experience: 'intermediate' as const,
        daysPerWeek: 3,
        trainingWeekdays: [1, 3, 5],
        sessionMin: 60,
        equipment: [
          'barbell',
          'dumbbell',
          'cable',
          'machine',
          'bench',
          'pullup_bar',
          'bodyweight',
          'squat_rack',
        ] as const,
        allergies: ['peanut'] as const,
      };
      const p = {
        ...profile,
        equipment: [...profile.equipment],
        allergies: [...profile.allergies],
      };
      return { result, profile: p, cat: getEngineCatalogues() };
    }

    it('replaces the rules plan with a valid AI plan (source ai)', async () => {
      const { result, profile, cat } = await rulesWeek();
      const aiPlan: WeekPlan = {
        ...planWeek(profile, {}, cat, { now: NOW, weekStart: '2026-11-16', seed: 'ai' }),
        generatedBy: 'llm',
      };
      const fetchAi: AiFetcher = async () => ({ source: 'ai', plan: aiPlan });
      const out = await upgradeWithAi(result, profile, {}, [1, 3, 5], { now: NOW, fetchAi });
      expect(out?.source).toBe('ai');
      expect(out?.version).toBe(2);
      const latest = plansRepo.list(eq(plans.type, 'training')).find((p) => p.version === 2);
      expect(latest?.generatedBy).toBe('ai');
      expect(sessionsForDate(aiPlan.sessions.find((s) => s.date >= TODAY)!.date)[0]!.title).toBe(
        aiPlan.sessions.find((s) => s.date >= TODAY)!.title,
      );
    });

    it('keeps the rules plan when the AI answer is invalid, offline or stale', async () => {
      const { result, profile } = await rulesWeek();
      const junk: AiFetcher = async () => ({ source: 'ai', plan: { weekStart: '2026-11-16' } });
      expect(
        await upgradeWithAi(result, profile, {}, [1, 3, 5], { now: NOW, fetchAi: junk }),
      ).toBeNull();
      const offline: AiFetcher = async () => {
        throw new Error('offline');
      };
      expect(
        await upgradeWithAi(result, profile, {}, [1, 3, 5], { now: NOW, fetchAi: offline }),
      ).toBeNull();
      expect(
        plansRepo.list(eq(plans.type, 'training')).every((p) => p.generatedBy === 'rules'),
      ).toBe(true);
    });

    it('never overwrites a newer local regenerate', async () => {
      const { result, profile, cat } = await rulesWeek();
      await regenerateWeek({ now: NOW + 5, ai: false }); // version 2 lands first
      const aiPlan = planWeek(profile, {}, cat, { now: NOW, weekStart: '2026-11-16' });
      const out = await upgradeWithAi(result, profile, {}, [1, 3, 5], {
        now: NOW,
        fetchAi: async () => ({ source: 'ai', plan: aiPlan }),
      });
      expect(out).toBeNull();
    });
  });

  describe('swaps', () => {
    it('offers up to 3 exercise alternatives and applies one', async () => {
      completeProfile();
      await regenerateWeek({ now: NOW, fetchAi: noAi });
      const session = sessionsForDate(TODAY)[0]!;
      const ex = exercisesForSession(session.id);
      const target = ex[ex.length - 1]!;
      const options = swapExerciseOptions(target.id, NOW);
      expect(options.length).toBeGreaterThan(0);
      expect(options.length).toBeLessThanOrEqual(3);
      expect(options).not.toContain(target.exerciseId);
      const swapped = applyExerciseSwap(target.id, options[0]!, NOW + 1);
      expect(swapped?.exerciseId).toBe(options[0]);
      expect(swapped?.position).toBe(target.position);
      expect(swapExerciseOptions('missing', NOW)).toEqual([]);
    });

    it('offers meal alternatives and applies one with its portion', async () => {
      completeProfile();
      await regenerateWeek({ now: NOW, fetchAi: noAi });
      const mp = mealPlanForDate(TODAY)!;
      const m = mealsForPlan(mp.id)[0]!;
      const options = swapMealOptions(m.id, NOW);
      expect(options.length).toBeGreaterThan(0);
      expect(options.every((o) => o.recipeId !== m.recipeId)).toBe(true);
      const out = applyMealSwap(m.id, options[0]!, NOW + 1);
      expect(out).toMatchObject({
        recipeId: options[0]!.recipeId,
        portion: options[0]!.servings,
        swappedFrom: m.recipeId,
      });
      expect(swapMealOptions('missing', NOW)).toEqual([]);
    });
  });
});
