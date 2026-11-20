/** Perf audit r2 N11: "Previous" reads only the newest finished session, same answer as before. */
import { finishedBench, freshDb, plannedSession } from '../../../../test/workoutFixtures';
import { getRawDb } from '@/db/client';

import {
  exerciseHistory,
  exercisesForSession,
  previousSets,
  sessionsRepo,
  setsFor,
  setsRepo,
  startWorkout,
} from '../repo';

beforeEach(freshDb);

const BENCH = 'barbell-bench-press';
const T0 = Date.UTC(2026, 9, 1, 9);
const DAY = 86_400_000;

/** The previous implementation: all history, newest session kept. */
function reference(exerciseId: string, exclude: string | null) {
  const all = exerciseHistory(exerciseId, exclude);
  const ids = all.map((s) => s.id);
  if (ids.length === 0) return [];
  const rows = getRawDb().getAllSync(
    `SELECT st.id AS id, se.session_id AS sid FROM sets st JOIN session_exercises se ON se.id = st.session_exercise_id
      WHERE st.id IN (${ids.map(() => '?').join(',')})`,
    ids,
  ) as { id: string; sid: string }[];
  const sid = new Map(rows.map((r) => [r.id, r.sid]));
  const first = sid.get(all[0]!.id);
  return all.filter((s) => sid.get(s.id) === first);
}

it('no history → empty', () => {
  expect(previousSets(BENCH, null)).toEqual([]);
});

it('returns the newest finished session’s done sets, in set order', () => {
  finishedBench('2026-10-01', 80, 8, T0);
  const newest = finishedBench('2026-10-03', 85, 6, T0 + 2 * DAY);
  const prev = previousSets(BENCH, null);
  expect(prev.length).toBeGreaterThan(0);
  expect(prev.every((s) => s.weightKg === 85 && s.reps === 6)).toBe(true);
  expect(prev.map((s) => s.idx)).toEqual([...prev.map((s) => s.idx)].sort((a, b) => a - b));
  expect(prev).toEqual(reference(BENCH, null));
  // Excluding that session falls back to the one before.
  expect(previousSets(BENCH, newest.id).every((s) => s.weightKg === 80)).toBe(true);
  expect(previousSets(BENCH, newest.id)).toEqual(reference(BENCH, newest.id));
});

it('skips sessions whose sets were all deleted, deleted sessions and unfinished ones', () => {
  finishedBench('2026-10-01', 80, 8, T0);
  const wiped = finishedBench('2026-10-02', 90, 5, T0 + DAY);
  const se = exercisesForSession(wiped.id)[0]!;
  for (const st of setsFor(se.id)) setsRepo.remove(st.id);
  const gone = finishedBench('2026-10-03', 95, 5, T0 + 2 * DAY);
  sessionsRepo.remove(gone.id);
  const open = plannedSession('2026-10-04');
  startWorkout(open.id, () => false, T0 + 3 * DAY);
  const prev = previousSets(BENCH, open.id);
  expect(prev.every((s) => s.weightKg === 80)).toBe(true);
  expect(prev).toEqual(reference(BENCH, open.id));
});
