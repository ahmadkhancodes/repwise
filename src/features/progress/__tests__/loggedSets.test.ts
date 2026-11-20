/**
 * Perf audit r2 N4: Progress reads logged sets with one joined, indexed query instead of three
 * whole tables joined in JS. It must give exactly what `flattenSets` gave.
 */
import { finishedBench, freshDb, plannedSession } from '../../../../test/workoutFixtures';
import { getRawDb } from '@/db/client';
import {
  exercisesForSession,
  sessionExercisesRepo,
  sessionsRepo,
  setDone,
  setsFor,
  setsRepo,
  startWorkout,
} from '@/features/workout/repo';

import { flattenSets, toLoggedSets } from '../logic/workouts';
import { loggedSetRows } from '../repo';

beforeEach(freshDb);

const viaJs = () => flattenSets(sessionsRepo.list(), sessionExercisesRepo.list(), setsRepo.list());

it('matches flattenSets: done sets only, deleted rows and skipped sessions excluded', () => {
  const day = 86_400_000;
  const t0 = Date.UTC(2026, 9, 1, 9);
  finishedBench('2026-10-01', 80, 8, t0);
  finishedBench('2026-10-03', 82.5, 6, t0 + 2 * day);
  // An active session with one ticked set and one open set.
  const live = plannedSession('2026-10-05');
  startWorkout(live.id, () => false, t0 + 4 * day);
  const [first] = setsFor(exercisesForSession(live.id)[0]!.id);
  setDone(first!.id, true, { weightKg: 100, reps: 5 }, t0 + 4 * day + 1);
  // A skipped session with a ticked set: excluded.
  const skipped = finishedBench('2026-10-04', 60, 10, t0 + 3 * day);
  sessionsRepo.update(skipped.id, { status: 'skipped' });
  // A soft-deleted set: excluded.
  const [gone] = setsRepo.list().filter((s) => s.doneAt != null);
  setsRepo.remove(gone!.id);

  const expected = viaJs();
  expect(expected.length).toBeGreaterThan(3);
  expect(toLoggedSets(loggedSetRows())).toEqual(expected);
});

it('empty history → no rows', () => {
  expect(toLoggedSets(loggedSetRows())).toEqual([]);
});

it('uses the partial done_at index (no full scan of sets)', () => {
  const plan = getRawDb().getAllSync(
    'EXPLAIN QUERY PLAN SELECT id FROM sets WHERE done_at IS NOT NULL AND deleted_at IS NULL ORDER BY done_at',
  ) as { detail: string }[];
  expect(plan.map((p) => p.detail).join(' ')).toContain('sets_done_at_idx');
});
