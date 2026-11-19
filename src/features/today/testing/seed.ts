/**
 * Test-only seeding for Today / assistant / check-in tests (real SQLite via the expo-sqlite
 * double). Not imported by app code.
 */
import { resetDbForTests } from '@/db/client';
import { migrateDb } from '@/db/migrate';
import { setRowOwner } from '@/db/owner';
import { mealPlansRepo, mealsRepo } from '@/features/meals/repo';
import { plansRepo } from '@/features/planner/repo';
import { bodyMetricsRepo } from '@/features/progress/repo';
import { saveProfile } from '@/features/settings/repo';
import { sessionExercisesRepo, sessionsRepo, setsRepo } from '@/features/workout/repo';

/** Real catalogue ids (packages/content). */
export const RECIPE = { breakfast: 'anda-paratha-breakfast', lunch: 'chicken-karahi' } as const;
export const EXERCISE = { squat: 'barbell-back-squat', front: 'barbell-front-squat' } as const;

export async function freshDb(): Promise<void> {
  resetDbForTests();
  setRowOwner(null);
  await migrateDb();
}

export function seedProfile(onboardedAt: number | null = Date.UTC(2026, 10, 1), extra: Record<string, unknown> = {}) {
  return saveProfile({
    name: 'Sam',
    goal: 'fat_loss',
    sex: 'male',
    birthYear: 1996,
    heightCm: 180,
    weightKg: 82,
    mealTimes: ['08:00', '13:00'],
    onboardedAt,
    ...extra,
  });
}

export function seedTrainingPlan(weekStart = '2026-11-16') {
  return plansRepo.insert({ type: 'training', weekStart, version: 1, payload: {}, generatedBy: 'rules' });
}

export function seedSession(
  date: string,
  opts: { title?: string; status?: 'planned' | 'active' | 'done' | 'skipped'; exercises?: string[] } = {},
) {
  const s = sessionsRepo.insert({ date, title: opts.title ?? 'Leg day', status: opts.status ?? 'planned' });
  (opts.exercises ?? [EXERCISE.squat, EXERCISE.front]).forEach((exerciseId, position) =>
    sessionExercisesRepo.insert({ sessionId: s.id, exerciseId, position, targetSets: 4, restS: 120 }),
  );
  return s;
}

/** A finished session with one working set per lift at the given load. */
export function seedDoneLift(date: string, exerciseId: string, kg: number, reps = 5) {
  const s = sessionsRepo.insert({ date, title: 'Legs', status: 'done' });
  const se = sessionExercisesRepo.insert({ sessionId: s.id, exerciseId, position: 0, targetSets: 1 });
  setsRepo.insert({ sessionExerciseId: se.id, idx: 0, type: 'working', weightKg: kg, reps, doneAt: 1 });
  return s;
}

export function seedMealDay(
  date: string,
  opts: { kcal?: number; dayType?: 'training' | 'rest'; meals?: { slot: string; recipeId: string }[] } = {},
) {
  const plan = mealPlansRepo.insert({
    date,
    dayType: opts.dayType ?? 'training',
    kcalTarget: opts.kcal ?? 2300,
    macros: { protein: 160, carbs: 250, fat: 70 },
  });
  const meals = (
    opts.meals ?? [
      { slot: 'breakfast', recipeId: RECIPE.breakfast },
      { slot: 'lunch', recipeId: RECIPE.lunch },
    ]
  ).map((m) => mealsRepo.insert({ mealPlanId: plan.id, slot: m.slot, recipeId: m.recipeId, portion: 1, status: 'planned' }));
  return { plan, meals };
}

export function seedWeight(date: string, kg: number) {
  return bodyMetricsRepo.insert({ date, weightKg: kg });
}

/** Local epoch ms for a wall-clock time (device zone), e.g. at(2026, 11, 19, 9). */
export function at(y: number, m: number, d: number, h = 9, min = 0): number {
  return new Date(y, m - 1, d, h, min).getTime();
}
