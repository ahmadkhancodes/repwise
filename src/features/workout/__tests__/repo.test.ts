import { freshDb, finishedBench, plannedSession } from '../../../../test/workoutFixtures';

import {
  activeSession,
  addExercise,
  addSet,
  discardWorkout,
  doneSessions,
  exerciseHistory,
  exercisesForSession,
  finishWorkout,
  getSession,
  pauseWorkout,
  previousSets,
  recentSessionExercises,
  removeExercise,
  removeSet,
  reorderExercises,
  resumeWorkout,
  sessionsBetween,
  setDone,
  setExerciseNotes,
  setsFor,
  setsForSession,
  startWorkout,
  swapExerciseRow,
  updateSet,
} from '../repo';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 10, 9);

beforeEach(freshDb);

describe('workout repo', () => {
  it('starts a planned session with pre-filled set rows (target load, then previous)', () => {
    finishedBench('2026-11-10', 80, 9, T0);
    const s = plannedSession('2026-11-19');
    expect(activeSession()).toBeUndefined();
    startWorkout(s.id, () => false, T0 + 9 * DAY);
    expect(getSession(s.id)).toMatchObject({ status: 'active', startedAt: T0 + 9 * DAY });
    const [squat, bench] = exercisesForSession(s.id);
    expect(setsFor(squat!.id).map((x) => [x.weightKg, x.reps, x.doneAt])).toEqual([
      [100, 5, null],
      [100, 5, null],
      [100, 5, null],
    ]);
    expect(setsFor(bench!.id).map((x) => x.weightKg)).toEqual([80, 80, 80]);
    expect(activeSession()?.id).toBe(s.id);
    // Restarting after a crash keeps the start time and does not duplicate sets.
    startWorkout(s.id, () => false, T0 + 9 * DAY + 5000);
    expect(getSession(s.id)?.startedAt).toBe(T0 + 9 * DAY);
    expect(setsFor(bench!.id)).toHaveLength(3);
  });

  it('reads previous sets and history from finished sessions only', () => {
    const old = finishedBench('2026-11-10', 80, 9, T0);
    finishedBench('2026-11-12', 82.5, 8, T0 + 2 * DAY);
    const s = plannedSession('2026-11-19');
    startWorkout(s.id);
    expect(previousSets('barbell-bench-press', s.id).map((x) => x.weightKg)).toEqual([82.5, 82.5]);
    expect(exerciseHistory('barbell-bench-press', s.id)).toHaveLength(4);
    expect(previousSets('barbell-back-squat', s.id)).toEqual([]);
    expect(doneSessions().map((d) => d.title)).toEqual(['Old bench', 'Old bench']);
    expect(recentSessionExercises(s.id)).toEqual([
      { date: '2026-11-10', exerciseIds: ['barbell-bench-press'] },
      { date: '2026-11-12', exerciseIds: ['barbell-bench-press'] },
    ]);
    expect(sessionsBetween('2026-11-09', '2026-11-11').map((x) => x.id)).toEqual([old.id]);
  });

  it('logs, edits, adds and removes sets', () => {
    const s = plannedSession();
    startWorkout(s.id);
    const se = exercisesForSession(s.id)[1]!;
    const [first] = setsFor(se.id);
    setDone(first!.id, true, { weightKg: 60, reps: 10 }, 5);
    expect(setsFor(se.id)[0]).toMatchObject({ weightKg: 60, reps: 10, doneAt: 5 });
    updateSet(first!.id, { rpe: 8, type: 'warmup' });
    expect(setsFor(se.id)[0]).toMatchObject({ rpe: 8, type: 'warmup' });
    setDone(first!.id, false);
    expect(setsFor(se.id)[0]?.doneAt).toBeNull();
    const extra = addSet(se.id);
    expect(extra).toMatchObject({ idx: 3, type: 'working' });
    removeSet(extra.id);
    expect(setsFor(se.id)).toHaveLength(3);
  });

  it('adds, swaps, reorders, annotates and removes exercises', () => {
    const s = plannedSession();
    startWorkout(s.id);
    const added = addExercise(s.id, { exerciseId: 'barbell-row' });
    expect(added.position).toBe(2);
    expect(setsFor(added.id)).toHaveLength(3); // running → rows created at once
    const bench = exercisesForSession(s.id)[1]!;
    setDone(setsFor(bench.id)[0]!.id, true, { weightKg: 60, reps: 10 });
    swapExerciseRow(bench.id, 'dumbbell-bench-press');
    const swapped = exercisesForSession(s.id)[1]!;
    expect(swapped.exerciseId).toBe('dumbbell-bench-press');
    expect(setsFor(bench.id).map((x) => x.doneAt != null)).toEqual([true]); // logged set kept
    reorderExercises(s.id, [added.id, exercisesForSession(s.id)[0]!.id, swapped.id]);
    expect(exercisesForSession(s.id).map((e) => e.exerciseId)).toEqual([
      'barbell-row',
      'barbell-back-squat',
      'dumbbell-bench-press',
    ]);
    setExerciseNotes(added.id, 'Seat 4');
    expect(exercisesForSession(s.id)[0]?.notes).toBe('Seat 4');
    setExerciseNotes(added.id, '  ');
    expect(exercisesForSession(s.id)[0]?.notes).toBeNull();
    removeExercise(added.id);
    expect(exercisesForSession(s.id)).toHaveLength(2);
    expect(setsFor(added.id)).toEqual([]);
  });

  it('swaps a planned (not started) exercise without creating sets', () => {
    const s = plannedSession();
    const se = exercisesForSession(s.id)[0]!;
    swapExerciseRow(se.id, 'goblet-squat');
    expect(setsFor(se.id)).toEqual([]);
    expect(swapExerciseRow('missing', 'x')).toBeUndefined();
  });

  it('pauses (excluded time), finishes (drops unticked sets) and discards', () => {
    const s = plannedSession();
    startWorkout(s.id, () => false, 0);
    pauseWorkout(s.id, 1000);
    expect(getSession(s.id)?.status).toBe('paused');
    resumeWorkout(s.id, 4000, 5000);
    expect(getSession(s.id)).toMatchObject({ status: 'active', pausedMs: 4000 });
    const se = exercisesForSession(s.id)[0]!;
    setDone(setsFor(se.id)[0]!.id, true, {}, 6000);
    finishWorkout(s.id, 10_000);
    expect(getSession(s.id)).toMatchObject({ status: 'done', endedAt: 10_000 });
    expect([...setsForSession(s.id).values()].flat()).toHaveLength(1);

    const adhoc = plannedSession();
    startWorkout(adhoc.id);
    discardWorkout(adhoc.id);
    expect(getSession(adhoc.id)).toBeUndefined();
  });
});
