import { and, eq, gte } from 'drizzle-orm';

import { resetDbForTests } from '@/db/client';
import { migrateDb } from '@/db/migrate';
import { setRowOwner } from '@/db/owner';
import { plans, sessions } from '@/db/schema';
import { getProfile, saveProfile } from '@/features/settings/repo';
import { exercisesForSession, sessionsForDate, sessionsRepo } from '@/features/workout/repo';

import { ensurePlannedAhead } from '../bridge';
import { addDays, planWeek, type WeekPlan } from '../engine';
import { toEngineProfile } from '../logic/profile';
import {
  applyExerciseSwap,
  generateInitialPlan,
  getEngineCatalogues,
  isUntouchedSession,
  localToday,
  planToday,
  regenerateWeek,
  swapExerciseOptions,
  upgradeWithAi,
} from '../planService';
import { plansRepo } from '../repo';

// Thursday 19 Nov 2026, 09:00 local (week of Mon 16 Nov). Training weekdays Tue/Thu/Sat.
const NOW = new Date(2026, 10, 19, 9, 0, 0).getTime();
const DAY = 86_400_000;
const TODAY = localToday(NOW);

function completeProfile() {
  saveProfile({
    goal: 'muscle_gain',
    sex: 'male',
    birthYear: 1995,
    heightCm: 180,
    weightKg: 78,
    targetKg: 82,
    experience: 'intermediate',
    days: 3,
    sessionMin: 60,
    equipment: ['barbell', 'dumbbell', 'cable', 'machine', 'bench', 'pullup_bar', 'bodyweight', 'squat_rack'],
    injuries: [],
    dietType: 'omnivore',
    allergies: [],
    dislikes: [],
    cuisines: [],
    budget: '2',
    cookMin: 30,
    mealsPerDay: 3,
    units: 'metric',
    activityLevel: 'light',
  });
}

const upcoming = () => sessionsRepo.list(gte(sessions.date, TODAY));
const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

beforeEach(async () => {
  resetDbForTests();
  setRowOwner(null);
  await migrateDb();
  completeProfile();
});

describe('week rollover (Train / Today never go empty)', () => {
  it('plans week 3 on its own, once', async () => {
    await generateInitialPlan({ now: NOW, ai: false });
    const week3Thu = NOW + 14 * DAY; // Thu 3 Dec
    const day = localToday(week3Thu);
    expect(sessionsForDate(day)).toHaveLength(0);

    expect(ensurePlannedAhead(week3Thu)).toBe(1);
    const today = planToday(day, week3Thu);
    expect(today.session?.status).toBe('planned');
    expect(today.exercises.length).toBeGreaterThan(0);
    expect(today.mealPlan).not.toBeNull();
    expect(sessionsForDate(localToday(week3Thu + 2 * DAY))).toHaveLength(1); // Sat 5 Dec
    expect(
      plansRepo.list(and(eq(plans.type, 'training'), eq(plans.weekStart, '2026-11-30'))),
    ).toHaveLength(1);

    // Idempotent on every foreground.
    expect(ensurePlannedAhead(week3Thu + 1000)).toBe(0);
    expect(sessionsForDate(day)).toHaveLength(1);
  });

  it('on Sunday also plans next week, so tomorrow is never empty', async () => {
    await generateInitialPlan({ now: NOW, ai: false });
    const sunday = NOW + 17 * DAY; // Sun 6 Dec
    expect(ensurePlannedAhead(sunday)).toBe(2);
    expect(sessionsForDate(addDays(localToday(sunday), 2))).toHaveLength(1); // Tue 8 Dec
  });
});

describe('regenerate and AI upgrade keep the user’s sessions', () => {
  it('rewrites untouched planned sessions in place (same ids)', async () => {
    await regenerateWeek({ now: NOW, ai: false });
    const before = upcoming();
    expect(before.length).toBeGreaterThan(0);
    expect(before.every(isUntouchedSession)).toBe(true);

    const again = await regenerateWeek({ now: NOW + 1000, ai: false });
    const after = upcoming();
    expect(ids(after)).toEqual(ids(before));
    expect(after.every((s) => s.planId === again.trainingPlanId)).toBe(true);
    expect(after.every(isUntouchedSession)).toBe(true);
  });

  it('a swapped session survives a regenerate and the AI upgrade', async () => {
    const rules = await regenerateWeek({ now: NOW, ai: false });
    const session = sessionsForDate(TODAY)[0]!;
    const target = exercisesForSession(session.id).at(-1)!;
    const choice = swapExerciseOptions(target.id, NOW)[0]!;
    applyExerciseSwap(target.id, choice, NOW + 1);
    expect(isUntouchedSession(sessionsRepo.get(session.id)!)).toBe(false);
    const snapshot = exercisesForSession(session.id).map((e) => [e.id, e.exerciseId]);

    // The AI answer lands after the swap.
    const profile = { ...toEngineProfile(getProfile())!, trainingWeekdays: [1, 3, 5] };
    const aiPlan: WeekPlan = {
      ...planWeek(profile, {}, getEngineCatalogues(), { now: NOW, weekStart: '2026-11-16', seed: 'ai' }),
      generatedBy: 'llm',
    };
    const out = await upgradeWithAi(rules, profile, {}, [1, 3, 5], {
      now: NOW,
      fetchAi: async () => ({ source: 'ai', plan: aiPlan }),
    });
    expect(out?.source).toBe('ai');
    expect(sessionsForDate(TODAY).map((s) => s.id)).toEqual([session.id]);
    expect(exercisesForSession(session.id).map((e) => [e.id, e.exerciseId])).toEqual(snapshot);

    // And a later regenerate (e.g. the weekly check-in) leaves it alone too.
    await regenerateWeek({ now: NOW + 2000, ai: false });
    expect(sessionsForDate(TODAY).map((s) => s.id)).toEqual([session.id]);
    expect(exercisesForSession(session.id).map((e) => [e.id, e.exerciseId])).toEqual(snapshot);
  });

  it('never touches a workout in progress or an ad-hoc session', async () => {
    await regenerateWeek({ now: NOW, ai: false });
    const session = sessionsForDate(TODAY)[0]!;
    sessionsRepo.update(session.id, { status: 'active', startedAt: NOW });
    const adHoc = sessionsRepo.insert({ date: addDays(TODAY, 1), title: 'My session', status: 'planned' });
    await regenerateWeek({ now: NOW + 1000, ai: false });
    expect(sessionsRepo.get(session.id)?.status).toBe('active');
    expect(sessionsForDate(TODAY).map((s) => s.id)).toEqual([session.id]);
    expect(sessionsRepo.get(adHoc.id)?.deletedAt ?? null).toBeNull();
  });
});
