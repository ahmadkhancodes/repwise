import { freshDb, plannedSession, TODAY } from '../../../../test/workoutFixtures';
import { resetAnalyticsForTests, trackedEvents } from '@/services/analytics';
import { getCatalog } from '@/services/catalog';

import { logSetAction, pauseWorkoutAction, startRoutineAction, startWorkoutAction, undoSetAction } from '../actions';
import { isCardioPattern } from '../logic/cardio';
import { activeSession, createSession, exercisesForSession, getSession, sessionsRepo, setsFor } from '../repo';
import { restTimer } from '../restTimerStore';

beforeEach(async () => {
  await freshDb();
  resetAnalyticsForTests();
  restTimer.skip();
});

describe('startWorkoutAction', () => {
  it('refuses to start a second workout while one is active, so the first is never orphaned', () => {
    const a = plannedSession(TODAY(), 'A');
    const b = plannedSession(TODAY(), 'B');
    expect(startWorkoutAction(a.id, getCatalog(), 1_000)).toEqual({ started: true });
    expect(startWorkoutAction(b.id, getCatalog(), 2_000)).toEqual({ started: false, activeSessionId: a.id });
    expect(getSession(b.id)!.status).toBe('planned');
    expect(activeSession()!.id).toBe(a.id);
    // Starting the same one again is fine (idempotent).
    expect(startWorkoutAction(a.id, getCatalog(), 3_000).started).toBe(true);
  });
});

describe('startWorkoutAction before the exercises part loads (R2-2)', () => {
  it('a null catalogue still gives cardio exercises cardio rows', () => {
    const rower = getCatalog().exercises.find((e) => isCardioPattern(e.pattern))!;
    expect(rower).toBeTruthy();
    const s = createSession({ date: TODAY(), title: 'Cardio', exercises: [{ exerciseId: rower.id, targetSets: 1, targetReps: '1' }] });
    expect(startWorkoutAction(s.id, null, 1_000).started).toBe(true);
    const rows = setsFor(exercisesForSession(s.id)[0]!.id);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.type === 'cardio')).toBe(true);
  });
});

describe('startRoutineAction (R2-3)', () => {
  const routine = () => ({
    date: TODAY(),
    name: 'My routine',
    exercises: [{ exerciseId: 'barbell-bench-press', targetSets: 3, targetReps: '8', restS: 90 }],
  });

  it('starts a new ad-hoc workout when nothing runs', () => {
    const res = startRoutineAction(routine(), getCatalog(), 1_000);
    expect(res.started).toBe(true);
    expect(activeSession()!.id).toBe(res.started ? res.sessionId : '');
  });

  it('while a workout is paused, creates nothing and points to the running one', () => {
    const a = plannedSession(TODAY(), 'A');
    startWorkoutAction(a.id, getCatalog(), 1_000);
    pauseWorkoutAction(a.id, 1_500);
    const before = sessionsRepo.list().length;
    expect(startRoutineAction(routine(), getCatalog(), 2_000)).toEqual({ started: false, activeSessionId: a.id });
    expect(sessionsRepo.list()).toHaveLength(before);
    expect(activeSession()!.id).toBe(a.id);
  });
});

describe('set ticks', () => {
  it('a double tap (stale render state) logs the set once and restarts the rest once', () => {
    const s = plannedSession();
    startWorkoutAction(s.id, getCatalog(), 1_000);
    const se = exercisesForSession(s.id)[0]!;
    const set = setsFor(se.id)[0]!; // the render's copy: doneAt null
    const opts = { sessionId: s.id, set, restS: se.restS, exerciseId: se.exerciseId, catalog: getCatalog(), unit: 'kg' as const };
    logSetAction({ ...opts, patch: { weightKg: 100, reps: 5 }, now: 10_000 });
    const firstRest = restTimer.getState();
    logSetAction({ ...opts, patch: { weightKg: 100, reps: 5 }, now: 10_300 });
    expect(setsFor(se.id)[0]!.doneAt).toBe(10_000);
    expect(restTimer.getState()).toEqual(firstRest);
    expect(trackedEvents().filter((e) => e.event === 'set_logged')).toHaveLength(1);
    // Undo twice from the same stale copy: the second is a no-op.
    const done = setsFor(se.id)[0]!;
    undoSetAction(done, 11_000);
    undoSetAction(done, 11_100);
    expect(setsFor(se.id)[0]!.doneAt).toBeNull();
  });
});
