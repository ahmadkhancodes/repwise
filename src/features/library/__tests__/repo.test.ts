import { resetDbForTests } from '@/db/client';
import { migrateDb } from '@/db/migrate';
import { setRowOwner } from '@/db/owner';
import {
  exercisesForSession,
  logSet,
  sessionExercisesRepo,
  sessionsRepo,
  setsRepo,
} from '@/features/workout/repo';

import { EMPTY_DRAFT } from '../logic/customExercise';
import {
  ADDED_TARGET_SETS,
  addExerciseToSession,
  createCustomExercise,
  customExercisesRepo,
  deleteCustomExercise,
  exerciseHistory,
  openSessions,
  recentlyLogged,
  updateCustomExercise,
} from '../repo';

beforeEach(async () => {
  resetDbForTests();
  setRowOwner(null);
  await migrateDb();
});

const draft = {
  ...EMPTY_DRAFT,
  name: 'Garage row',
  primaryMuscles: ['lats' as const],
  equipment: ['dumbbell' as const],
};

describe('custom exercises', () => {
  it('create, update and soft delete (synced table, dirty rows)', () => {
    const row = createCustomExercise(draft, 1000);
    expect(row).toMatchObject({
      name: 'Garage row',
      isCustom: true,
      dirty: 1,
      primaryMuscles: ['lats'],
      difficulty: 1,
    });
    const upd = updateCustomExercise(row.id, { ...draft, name: 'Garage row v2' }, 2000)!;
    expect(upd.name).toBe('Garage row v2');
    expect(upd.updatedAt).toBe(2000);
    expect(deleteCustomExercise(row.id, 3000)).toBe(true);
    expect(customExercisesRepo.get(row.id)).toBeUndefined();
    expect(customExercisesRepo.getIncludingDeleted(row.id)?.deletedAt).toBe(3000);
  });
});

function seedSession(date: string, exerciseId: string, status: 'planned' | 'done' = 'done') {
  const s = sessionsRepo.insert({ date, title: `Session ${date}`, status });
  const se = sessionExercisesRepo.insert({ sessionId: s.id, exerciseId, position: 0 });
  return { s, se };
}

describe('history and recently used', () => {
  it('joins sets → session exercise → session for one exercise, newest first, skipping deleted', () => {
    const a = seedSession('2026-11-10', 'barbell-back-squat');
    const b = seedSession('2026-11-12', 'barbell-back-squat');
    const other = seedSession('2026-11-12', 'push-up');
    logSet({ sessionExerciseId: a.se.id, weightKg: 100, reps: 5 }, 1000);
    logSet({ sessionExerciseId: b.se.id, weightKg: 105, reps: 5 }, 2000);
    const gone = logSet({ sessionExerciseId: b.se.id, weightKg: 200, reps: 5 }, 2100);
    setsRepo.remove(gone.id);
    setsRepo.insert({ sessionExerciseId: b.se.id, idx: 9, weightKg: 300, reps: 1 }); // not done
    logSet({ sessionExerciseId: other.se.id, weightKg: 0, reps: 20 }, 3000);

    const h = exerciseHistory('barbell-back-squat');
    expect(h.map((x) => [x.date, x.weightKg])).toEqual([
      ['2026-11-12', 105],
      ['2026-11-10', 100],
    ]);
    expect(h[0]).toMatchObject({ sessionId: b.s.id, type: 'working', reps: 5, doneAt: 2000 });
    expect(recentlyLogged()).toEqual([
      { id: 'push-up', at: 3000 },
      { id: 'barbell-back-squat', at: 2000 },
    ]);
  });
});

describe('add to workout', () => {
  it('lists open sessions from today and appends at the end', () => {
    sessionsRepo.insert({ date: '2026-11-18', title: 'Old', status: 'planned' });
    const done = sessionsRepo.insert({ date: '2026-11-19', title: 'Done', status: 'done' });
    const later = sessionsRepo.insert({ date: '2026-11-21', title: 'Legs', status: 'planned' });
    const today = sessionsRepo.insert({ date: '2026-11-19', title: 'Push', status: 'active' });
    expect(openSessions('2026-11-19').map((s) => s.title)).toEqual(['Push', 'Legs']);
    expect(openSessions('2026-11-19').some((s) => s.id === done.id)).toBe(false);

    sessionExercisesRepo.insert({ sessionId: today.id, exerciseId: 'bench-press', position: 0 });
    const added = addExerciseToSession(today.id, 'push-up');
    expect(added).toMatchObject({
      position: 1,
      targetSets: ADDED_TARGET_SETS,
      exerciseId: 'push-up',
    });
    expect(exercisesForSession(today.id).map((e) => e.exerciseId)).toEqual([
      'bench-press',
      'push-up',
    ]);
    expect(addExerciseToSession(later.id, 'push-up').position).toBe(0);
  });
});
