/** Seed the real (node:sqlite-backed) DB with the shared fixtures for screen tests. */
import { resetDbForTests } from '@/db/client';
import { migrateDb } from '@/db/migrate';
import { setRowOwner } from '@/db/owner';
import { mealPlansRepo, mealsRepo } from '@/features/meals/repo';
import { foodLogsRepo } from '@/features/nutrition/repo';
import { sessionExercisesRepo, sessionsRepo, setsRepo } from '@/features/workout/repo';

import { bodyMetricsRepo, photosRepo } from '../repo';

import { sessionExercises, sessions, sets } from './fixtures';

export async function freshDb() {
  resetDbForTests();
  setRowOwner(null);
  await migrateDb();
}

export function seedTraining() {
  for (const s of sessions) sessionsRepo.insert({ ...s, status: s.status as 'done' });
  for (const se of sessionExercises) sessionExercisesRepo.insert({ ...se });
  for (const st of sets) setsRepo.insert({ ...st, type: st.type as 'working' });
}

export function seedBody() {
  bodyMetricsRepo.insert({ date: '2026-11-01', weightKg: 80, waistCm: 85 });
  bodyMetricsRepo.insert({ date: '2026-11-03', weightKg: 80.4 });
  bodyMetricsRepo.insert({ date: '2026-11-08', weightKg: 79.8 });
  bodyMetricsRepo.insert({ date: '2026-11-15', waistCm: 84 });
}

export function seedNutrition() {
  mealPlansRepo.insert({ id: 'p1', date: '2026-11-10', kcalTarget: 2000 });
  for (const status of ['eaten', 'eaten', 'skipped'] as const)
    mealsRepo.insert({ mealPlanId: 'p1', slot: 'lunch', status });
  foodLogsRepo.insert({ date: '2026-11-10', source: 'plan', name: 'Bowl', kcal: 1950 });
  foodLogsRepo.insert({ date: '2026-11-18', source: 'quick', name: 'Snack', kcal: 300 });
}

export function seedPhotos() {
  photosRepo.insert({
    id: 'ph1',
    date: '2026-09-01',
    localUri: 'progress-photos/ph1.jpg',
    pose: 'front',
  });
  photosRepo.insert({
    id: 'ph2',
    date: '2026-11-10',
    localUri: 'progress-photos/ph2.jpg',
    pose: 'front',
  });
}
