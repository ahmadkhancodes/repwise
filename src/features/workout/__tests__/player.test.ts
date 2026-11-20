import { Platform } from 'react-native';

import { finishedBench, freshDb, plannedSession, TODAY } from '../../../../test/workoutFixtures';
import { resetAnalyticsForTests, trackedEvents } from '@/services/analytics';
import { getCatalog } from '@/services/catalog';
import { haptics } from '@/services/haptics';

import {
  discardWorkoutAction,
  flushSetWrites,
  resetSetWritesForTests,
  startWorkoutAction,
  tickSet,
  untickSet,
} from '../actions';
import { exerciseMeta } from '../exerciseMeta';
import { msToNextSecond } from '../hooks/useRestTimer';
import { maxWeight, nextAfter, nextPending, plateStep, prefillPatch, setTarget, workoutProgress } from '../logic/player';
import { setLabels } from '../logic/sets';
import { optimisticSets, resetOptimisticForTests } from '../optimistic';
import {
  atomic,
  doneSessionSummaries,
  exercisesForSession,
  getSession,
  markRemainingDone,
  removeExercise,
  restoreExercise,
  sessionsBetween,
  sessionsRepo,
  setsFor,
  undoDiscard,
  type WorkoutSet,
} from '../repo';
import { createSurfaceBridge, restOverContent } from '../restNotifier';
import { FRESH_END_MS, isFreshEnd, resetRestTimerForTests, restTimer } from '../restTimerStore';

const set = (id: string, over: Partial<WorkoutSet> = {}) =>
  ({ id, type: 'working', weightKg: 80, reps: 8, durationS: null, distanceM: null, doneAt: null, ...over }) as WorkoutSet;
const item = (name: string, sets: WorkoutSet[], cardio = false) => ({
  se: { id: `se-${name}`, exerciseId: name },
  meta: { name, cardio, equipment: [] as string[] },
  sets,
  labels: setLabels(sets),
});

describe(`player logic (${Platform.OS})`, () => {
  const items = [item('Squat', [set('a', { doneAt: 1 }), set('b')]), item('Bench', [set('c', { weightKg: null, reps: 10 })])];

  it('finds the next set and who comes after a set, from memory', () => {
    expect(nextPending(items)).toMatchObject({ itemIndex: 0, setIndex: 1, label: '2' });
    expect(nextAfter(items, 'a')).toEqual({ exercise: 'Squat', setNo: 2, detail: '80 kg × 8' });
    expect(nextAfter(items, 'b')).toEqual({ exercise: 'Bench', setNo: 1, detail: '10 reps' });
    expect(nextAfter(items, 'c')).toBeNull();
    // Optimistic view: b already shown done.
    expect(nextPending(items, (s) => s.id === 'a' || s.id === 'b')?.set.id).toBe('c');
  });

  it('reports progress through the workout', () => {
    expect(workoutProgress(items)).toMatchObject({ exerciseNo: 1, exerciseCount: 2, setNo: 2, setCount: 2, setsDone: 1, setsTotal: 3, complete: false, fractions: [0.5, 0] });
    expect(workoutProgress(items, () => true)).toMatchObject({ complete: true, setsDone: 3, exerciseNo: 2 });
    expect(workoutProgress([])).toMatchObject({ exerciseNo: 0, complete: false });
  });

  it('formats targets and plate steps per unit and equipment', () => {
    expect(setTarget(set('x'), 'kg')).toBe('80 kg × 8');
    expect(setTarget(set('x', { reps: null }), 'kg')).toBe('80 kg');
    expect(setTarget(set('x', { weightKg: null, reps: null }), 'kg')).toBe('');
    expect(setTarget(set('x', { durationS: 1200, distanceM: 3000 }), 'kg', true)).toBe('20 min · 3 km');
    expect(setTarget(set('x', { durationS: 600, distanceM: 1609.344 }), 'lb', true)).toBe('10 min · 1 mi');
    expect(plateStep('kg', ['barbell'])).toBe(2.5);
    expect(plateStep('lb', ['barbell'])).toBe(5);
    expect(plateStep('kg', ['dumbbell'])).toBe(1);
    expect(plateStep('lb', ['cable'])).toBe(2.5);
    expect(maxWeight('kg')).toBeLessThan(maxWeight('lb'));
  });

  it('fills only empty fields from last time', () => {
    const prev = set('p', { weightKg: 60, reps: 10, durationS: 900 });
    expect(prefillPatch(set('x', { weightKg: null }), prev, false)).toEqual({ weightKg: 60 });
    expect(prefillPatch(set('x', { weightKg: null, reps: null }), prev, false)).toEqual({ weightKg: 60, reps: 10 });
    expect(prefillPatch(set('x', { durationS: null }), prev, true)).toEqual({ durationS: 900 });
    expect(prefillPatch(set('x'), undefined, false)).toEqual({});
  });

  it('aligns the countdown tick to the displayed second', () => {
    expect(msToNextSecond(90_000)).toBe(1008);
    expect(msToNextSecond(89_400)).toBe(408);
    expect(msToNextSecond(0)).toBe(1000);
  });

  it('exercise meta carries the media id for the demo hero', () => {
    expect(exerciseMeta('nope', null).mediaId).toBeNull();
    expect('mediaId' in exerciseMeta('barbell-bench-press', getCatalog())).toBe(true);
  });
});

describe(`optimistic tick + batched writes (${Platform.OS})`, () => {
  beforeEach(async () => {
    await freshDb();
    resetAnalyticsForTests();
    resetRestTimerForTests();
    resetSetWritesForTests();
    resetOptimisticForTests();
  });

  function live(sessionId: string) {
    return exercisesForSession(sessionId).map((se) => {
      const sets = setsFor(se.id);
      const meta = exerciseMeta(se.exerciseId, getCatalog());
      return { se, meta, sets, labels: setLabels(sets) };
    });
  }

  it('applies the optimistic state and starts the rest BEFORE the DB promise resolves', async () => {
    const s = plannedSession();
    startWorkoutAction(s.id, getCatalog(), 1_000);
    const items = live(s.id);
    const first = items[0]!.sets[0]!;
    const p = tickSet({ sessionId: s.id, item: items[0]!, items, set: first, restS: 120, unit: 'kg' });
    // Same tick, synchronously: shown done, rest running, SQLite untouched.
    expect(optimisticSets.isDone(first.id, false)).toBe(true);
    expect(restTimer.getState()).toMatchObject({ status: 'running', next: { exercise: 'Barbell back squat', setNo: 2 } });
    expect(setsFor(items[0]!.se.id)[0]!.doneAt).toBeNull();
    const res = await p;
    expect(res.set?.doneAt).not.toBeNull();
    expect(setsFor(items[0]!.se.id)[0]!.doneAt).not.toBeNull();
    expect(trackedEvents().filter((e) => e.event === 'set_logged')).toHaveLength(1);
  });

  it('a second tap on a pending set is ignored; queued ticks land in one transaction', async () => {
    const s = plannedSession();
    startWorkoutAction(s.id, getCatalog(), 1_000);
    const items = live(s.id);
    const [a, b] = items[0]!.sets;
    const t1 = tickSet({ sessionId: s.id, item: items[0]!, items, set: a!, restS: 120, unit: 'kg' });
    const again = await tickSet({ sessionId: s.id, item: items[0]!, items, set: a!, restS: 120, unit: 'kg' });
    expect(again).toEqual({ pr: null, set: null });
    const t2 = tickSet({ sessionId: s.id, item: items[0]!, items, set: b!, restS: 120, unit: 'kg' });
    flushSetWrites(); // Finish/Discard flush synchronously
    await Promise.all([t1, t2]);
    expect(setsFor(items[0]!.se.id).map((x) => x.doneAt != null)).toEqual([true, true, false]);
  });

  it('detects a PR against the cached history', async () => {
    finishedBench('2026-11-10', 80, 8, Date.UTC(2026, 10, 10, 9));
    const s = plannedSession();
    startWorkoutAction(s.id, getCatalog(), 1_000);
    const items = live(s.id);
    const bench = items[1]!;
    const res = await tickSet({ sessionId: s.id, item: bench, items, set: bench.sets[0]!, patch: { weightKg: 85, reps: 5 }, restS: 90, unit: 'kg' });
    expect(res.pr).toMatchObject({ kind: 'weight', weightKg: 85 });
  });

  it('un-tick resolves with the old time; a failed write rolls the optimistic state back', async () => {
    const s = plannedSession();
    startWorkoutAction(s.id, getCatalog(), 1_000);
    let items = live(s.id);
    await tickSet({ sessionId: s.id, item: items[0]!, items, set: items[0]!.sets[0]!, restS: 120, unit: 'kg', now: 5_000 });
    items = live(s.id);
    expect(await untickSet(items[0]!.sets[0]!, 6_000)).toBe(5_000);
    expect(setsFor(items[0]!.se.id)[0]!.doneAt).toBeNull();

    const ghost = { ...items[0]!.sets[1]!, id: 'not-a-row' };
    const res = await tickSet({ sessionId: s.id, item: items[0]!, items, set: ghost, restS: 120, unit: 'kg' });
    expect(res.set).toBeNull();
  });
});

describe(`repo: transactions, undo, aggregates (${Platform.OS})`, () => {
  beforeEach(async () => {
    await freshDb();
    resetRestTimerForTests();
    resetSetWritesForTests();
  });

  it('atomic rolls everything back on error and nests', () => {
    const s = plannedSession();
    expect(() =>
      atomic(() => {
        sessionsRepo.update(s.id, { title: 'Changed' });
        atomic(() => sessionsRepo.update(s.id, { notes: 'x' }));
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(getSession(s.id)).toMatchObject({ title: 'Push day', notes: null });
  });

  it('discard of an ad-hoc workout is undone exactly; another running workout keeps it paused', () => {
    const s = plannedSession();
    startWorkoutAction(s.id, getCatalog(), 1_000);
    const snap = discardWorkoutAction(s.id, 2_000)!;
    expect(getSession(s.id)).toBeUndefined();
    expect(exercisesForSession(s.id)).toHaveLength(0);
    undoDiscard(snap, 3_000);
    expect(getSession(s.id)?.status).toBe('active');
    expect(setsFor(exercisesForSession(s.id)[0]!.id)).toHaveLength(3);

    const other = plannedSession(TODAY(), 'Other');
    const snap2 = discardWorkoutAction(s.id, 4_000)!;
    startWorkoutAction(other.id, getCatalog(), 5_000);
    undoDiscard(snap2, 6_000);
    expect(getSession(s.id)?.status).toBe('paused');
  });

  it('remove exercise + restore; mark remaining done only counts sets with values', () => {
    const s = plannedSession();
    startWorkoutAction(s.id, getCatalog(), 1_000);
    const [squat, bench] = exercisesForSession(s.id);
    const removed = removeExercise(bench!.id, 2_000);
    expect(exercisesForSession(s.id)).toHaveLength(1);
    restoreExercise(removed, 3_000);
    expect(setsFor(bench!.id)).toHaveLength(3);
    expect(markRemainingDone(s.id, 4_000)).toBe(6); // squat 100 × 5, bench reps 8
    expect(setsFor(squat!.id).every((x) => x.doneAt != null)).toBe(true);
  });

  it('history is one aggregate query; the week is an indexed date range', () => {
    finishedBench('2026-11-10', 80, 8, Date.UTC(2026, 10, 10, 9));
    finishedBench('2026-11-12', 60, 10, Date.UTC(2026, 10, 12, 9));
    const rows = doneSessionSummaries(10);
    expect(rows.map((r) => [r.session.date, r.sets, r.volumeKg, r.exercises])).toEqual([
      ['2026-11-12', 2, 1200, 1],
      ['2026-11-10', 2, 1280, 1],
    ]);
    expect(sessionsBetween('2026-11-11', '2026-11-13').map((x) => x.date)).toEqual(['2026-11-12']);
  });
});

describe(`rest end: haptics and sound (${Platform.OS})`, () => {
  beforeEach(() => resetRestTimerForTests());

  it('the store ends the rest on its own clock with ONE rest-end triple, only when on time', async () => {
    const spy = jest.spyOn(haptics, 'restEnd');
    restTimer.start('s1', 0.05, null, Date.now()); // rounds to 0 s: never starts
    expect(restTimer.getState().status).toBe('idle');
    const now = Date.now();
    restTimer.start('s1', 1, null, now - 990);
    await new Promise((r) => setTimeout(r, 60));
    expect(restTimer.getState().status).toBe('idle');
    expect(spy).toHaveBeenCalledTimes(1);
    // Noticed late (app was in the background): ends silently.
    restTimer.start('s1', 60, null, 0);
    expect(restTimer.check(60_000 + FRESH_END_MS + 1)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(isFreshEnd(1000, 1000 + FRESH_END_MS)).toBe(true);
    spy.mockRestore();
  });

  it('plays "Rest over" now, after the surfaces cleared the scheduled alert (race fix)', async () => {
    const order: string[] = [];
    const update = jest.fn((s: unknown) => {
      order.push(s ? 'show' : 'clear');
      return Promise.resolve();
    });
    const alert = jest.fn(() => order.push('alert'));
    const bridge = createSurfaceBridge(update, () => 61_000, alert);
    const last = { status: 'running', sessionId: 's1', durationMs: 60_000, startedAt: 1_000, endsAt: 61_000, pausedAt: null, next: { exercise: 'Squat', setNo: 2 } } as const;
    bridge.end('done', last);
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual(['clear', 'alert']);
    bridge.end('skipped', last);
    createSurfaceBridge(update, () => 61_000 + FRESH_END_MS + 1, alert).end('done', last);
    await new Promise((r) => setTimeout(r, 0));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(restOverContent(last)).toEqual({ title: 'Rest over', body: 'Next: Squat set 2' });
    expect(restOverContent({ next: null }).body).toBe('Time for your next set');
  });
});
