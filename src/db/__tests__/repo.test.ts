import { eq } from 'drizzle-orm';

import { getRawDb, resetDbForTests } from '@/db/client';
import { onLocalWrite } from '@/db/events';
import { migrateDb } from '@/db/migrate';
import { setRowOwner } from '@/db/owner';
import { nextUpdatedAt } from '@/db/repo';
import { sets } from '@/db/schema';
import { getProfile, saveProfile } from '@/features/settings/repo';
import { logSet, setsFor, setsRepo, sessionsRepo } from '@/features/workout/repo';
import { mealsForPlan, mealPlansRepo, mealsRepo, setMealStatus, swapMeal } from '@/features/meals/repo';
import { foodLogsRepo, logsForDate, sumLogs } from '@/features/nutrition/repo';
import { uuidv7Time } from '@/lib/ids';

beforeEach(async () => {
  resetDbForTests();
  setRowOwner(null);
  await migrateDb();
});

describe('migrations', () => {
  it('create every table and are idempotent', async () => {
    await migrateDb(); // second run is a no-op
    const rows = getRawDb().getAllSync(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '\\_\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite_%'",
    ) as { name: string }[];
    expect(rows.map((r) => r.name).sort()).toEqual(
      [
        'body_metrics', 'cards', 'exercises', 'food_logs', 'meal_plans', 'meals', 'photos', 'plans',
        'profile', 'recipes', 'routines', 'session_exercises', 'sessions', 'sets',
      ].sort(),
    );
  });
});

describe('generic repo', () => {
  it('stamps common columns on insert (uuid v7, null owner until sign-in, dirty)', () => {
    const s = sessionsRepo.insert({ date: '2026-11-19', title: 'Push' }, 1_763_550_000_000);
    expect(s.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uuidv7Time(s.id)).toBe(1_763_550_000_000);
    expect(s).toMatchObject({
      userId: null,
      createdAt: 1_763_550_000_000,
      updatedAt: 1_763_550_000_000,
      deletedAt: null,
      dirty: 1,
    });
  });

  it('uses the signed-in owner for new rows', () => {
    setRowOwner('user-1');
    expect(sessionsRepo.insert({ date: '2026-11-19' }).userId).toBe('user-1');
  });

  it('update bumps updated_at strictly and marks dirty', () => {
    const s = sessionsRepo.insert({ date: '2026-11-19' }, 1000);
    const u = sessionsRepo.update(s.id, { title: 'Legs' }, 1000);
    expect(u).toMatchObject({ title: 'Legs', updatedAt: 1001, dirty: 1 });
    expect(sessionsRepo.update('missing', { title: 'x' })).toBeUndefined();
  });

  it('remove is a soft delete hidden from reads', () => {
    const s = sessionsRepo.insert({ date: '2026-11-19' }, 1000);
    expect(sessionsRepo.remove(s.id, 2000)).toBe(true);
    expect(sessionsRepo.get(s.id)).toBeUndefined();
    expect(sessionsRepo.list()).toHaveLength(0);
    expect(sessionsRepo.getIncludingDeleted(s.id)).toMatchObject({ deletedAt: 2000, updatedAt: 2000, dirty: 1 });
    expect(sessionsRepo.remove(s.id)).toBe(false);
  });

  it('pings the sync scheduler on every write', () => {
    const seen: string[] = [];
    const off = onLocalWrite((t) => seen.push(t));
    const s = sessionsRepo.insert({ date: '2026-11-19' });
    sessionsRepo.update(s.id, { title: 'A' });
    sessionsRepo.remove(s.id);
    off();
    expect(seen).toEqual(['sessions', 'sessions', 'sessions']);
  });

  it('nextUpdatedAt never goes backwards', () => {
    expect(nextUpdatedAt(10, null)).toBe(10);
    expect(nextUpdatedAt(10, 5)).toBe(10);
    expect(nextUpdatedAt(10, 10)).toBe(11);
    expect(nextUpdatedAt(10, 99)).toBe(100);
  });
});

describe('domain repos', () => {
  it('profile is a single row (insert then update)', () => {
    expect(getProfile()).toBeUndefined();
    const a = saveProfile({ goal: 'build_muscle', equipment: ['dumbbell', 'bench'] });
    const b = saveProfile({ days: 4 });
    expect(b.id).toBe(a.id);
    expect(getProfile()).toMatchObject({ goal: 'build_muscle', days: 4, equipment: ['dumbbell', 'bench'] });
  });

  it('logSet appends sets in order', () => {
    logSet({ sessionExerciseId: 'se1', weightKg: 60, reps: 8 }, 1000);
    logSet({ sessionExerciseId: 'se1', weightKg: 62.5, reps: 6 }, 2000);
    logSet({ sessionExerciseId: 'other', reps: 10 }, 3000);
    const rows = setsFor('se1');
    expect(rows.map((r) => [r.idx, r.weightKg, r.doneAt])).toEqual([
      [0, 60, 1000],
      [1, 62.5, 2000],
    ]);
    expect(setsRepo.list(eq(sets.type, 'working'))).toHaveLength(3);
  });

  it('meals sort by slot, tick and swap', () => {
    const plan = mealPlansRepo.insert({ date: '2026-11-19', kcalTarget: 2200 });
    const dinner = mealsRepo.insert({ mealPlanId: plan.id, slot: 'dinner', recipeId: 'r1' });
    mealsRepo.insert({ mealPlanId: plan.id, slot: 'breakfast', recipeId: 'r2' });
    expect(mealsForPlan(plan.id).map((m) => m.slot)).toEqual(['breakfast', 'dinner']);
    expect(setMealStatus(dinner.id, 'eaten', 5000)).toMatchObject({ status: 'eaten', eatenAt: 5000 });
    expect(swapMeal(dinner.id, 'r9')).toMatchObject({ recipeId: 'r9', swappedFrom: 'r1', status: 'planned' });
  });

  it('food log totals', () => {
    foodLogsRepo.insert({ date: '2026-11-19', source: 'quick', name: 'Oats', kcal: 300, p: 10.04, c: 50, f: 5 });
    foodLogsRepo.insert({ date: '2026-11-19', source: 'search', name: 'Eggs', kcal: 155, p: 13, c: null, f: 11 });
    foodLogsRepo.insert({ date: '2026-11-20', source: 'quick', name: 'Other', kcal: 999 });
    expect(sumLogs(logsForDate('2026-11-19'))).toEqual({ kcal: 455, p: 23, c: 50, f: 16 });
  });
});
