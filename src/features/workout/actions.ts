/**
 * Workout actions: repo writes + rest timer + haptics + analytics in one place, so screens stay
 * thin and every path (list, exercise screen, notification) behaves the same.
 */
import { haptics } from '@/services/haptics';
import { track } from '@/services/analytics';
import { lazyCatalog, type Catalog } from '@/services/catalog';
import { kv } from '@/services/storage';
import { showToast } from '@/ui';

import { exerciseMeta } from './exerciseMeta';
import { holdWorkoutAwake, releaseWorkoutAwake } from './hooks/useWorkoutKeepAwake';
import { durationBucket } from './logic/duration';
import type { ItemLike } from './logic/player';
import { nextAfter } from './logic/player';
import { bestOf, detectPR, type Best, type PR } from './logic/prs';
import { defaultRestSeconds, type RestNext } from './logic/restTimer';
import { isDone, setLabels, type SetLike } from './logic/sets';
import { buildSummary } from './logic/summary';
import { formatWeight } from './logic/units';
import type { WeightUnit } from './logic/engine';
import { optimisticSets } from './optimistic';
import {
  activeSession,
  atomic,
  createSession,
  discardWorkout,
  type DiscardSnapshot,
  exerciseHistory,
  exercisesForSession,
  finishWorkout,
  getSession,
  pauseWorkout,
  resumeWorkout,
  setDone,
  setsForSession,
  setsRepo,
  startWorkout,
  type SetPatch,
  type WorkoutSet,
} from './repo';
import { restTimer } from './restTimerStore';

const pauseKey = (id: string) => `workout.pausedAt.${id}`;

export function pausedSince(sessionId: string): number | null {
  try {
    const v = Number(kv.getString(pauseKey(sessionId)));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export type StartResult = { started: true } | { started: false; activeSessionId: string };

/**
 * Start a planned session. Refused while another workout is active or paused (it would be
 * orphaned): the caller sends the user back to that one to finish or discard it first.
 */
export function startWorkoutAction(
  sessionId: string,
  catalog: Catalog | null,
  now: number = Date.now(),
): StartResult {
  const running = activeSession();
  if (running && running.id !== sessionId) {
    showToast({ message: 'Finish or discard the workout in progress first' });
    return { started: false, activeSessionId: running.id };
  }
  const before = getSession(sessionId);
  // A null catalogue (exercises part not parsed yet) would make every cardio exercise "strength"
  // and pre-fill weight × reps rows for the whole workout (R2-2). lazyCatalog's getters parse the
  // part synchronously, so the cardio flag is always right.
  const cat = catalog ?? lazyCatalog();
  const s = startWorkout(sessionId, (id) => exerciseMeta(id, cat).cardio, now);
  if (s?.status === 'active') holdWorkoutAwake(sessionId);
  if (s && before?.status === 'planned') {
    track('workout_started', {
      source: before.planId ? 'plan' : 'custom',
      exercises: exercisesForSession(sessionId).length,
    });
  }
  return { started: true };
}

export type RoutineStartResult =
  | { started: true; sessionId: string }
  | { started: false; activeSessionId: string };

/**
 * Start a routine as a new ad-hoc workout. While another workout is active or paused nothing is
 * created (no orphan session, R2-3): the caller opens the running one to resume or finish it.
 */
export function startRoutineAction(
  routine: { name: string; date: string; exercises: Parameters<typeof createSession>[0]['exercises'] },
  catalog: Catalog | null,
  now: number = Date.now(),
): RoutineStartResult {
  const running = activeSession();
  if (running) {
    showToast({ message: 'Finish or discard the workout in progress first' });
    return { started: false, activeSessionId: running.id };
  }
  const s = createSession({ date: routine.date, title: routine.name, exercises: routine.exercises }, now);
  const res = startWorkoutAction(s.id, catalog, now);
  return res.started ? { started: true, sessionId: s.id } : res;
}

export function pauseWorkoutAction(sessionId: string, now: number = Date.now()): void {
  try {
    kv.set(pauseKey(sessionId), String(now));
  } catch {
    // without the timestamp the pause simply counts as active time
  }
  pauseWorkout(sessionId, now);
  restTimer.pause(now);
  releaseWorkoutAwake(sessionId); // a paused workout lets the phone sleep
}

export function resumeWorkoutAction(sessionId: string, now: number = Date.now()): void {
  const since = pausedSince(sessionId);
  resumeWorkout(sessionId, since ? now - since : 0, now);
  try {
    kv.remove(pauseKey(sessionId));
  } catch {
    // ignore
  }
  restTimer.resume(now);
  holdWorkoutAwake(sessionId);
}

/** Who comes next after `setId` (for the rest timer + "Rest over" notification copy). */
export function nextUp(sessionId: string, setId: string, catalog: Catalog | null): RestNext | null {
  const ses = exercisesForSession(sessionId);
  const map = setsForSession(sessionId);
  let passed = false;
  for (const se of ses) {
    const list = map.get(se.id) ?? [];
    const labels = setLabels(list);
    for (let i = 0; i < list.length; i++) {
      const s = list[i] as WorkoutSet;
      if (s.id === setId) {
        passed = true;
        continue;
      }
      if (passed && !isDone(s)) {
        const n = Number(labels[i]);
        return {
          exercise: exerciseMeta(se.exerciseId, catalog).name,
          setNo: Number.isFinite(n) ? n : i + 1,
        };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// The 1-tap log (RW-20/22/23), optimistic (A3)
// ---------------------------------------------------------------------------

type Job = { run: () => unknown; resolve: (v: unknown) => void; reject: (e: unknown) => void };
let jobs: Job[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Run every queued set write now, in ONE transaction. Called on the next macrotask after a tap
 * (after the green tick is painted) and synchronously before Finish/Discard so nothing is lost.
 */
export function flushSetWrites(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  const batch = jobs;
  jobs = [];
  if (batch.length === 0) return;
  const results: { job: Job; ok: boolean; value: unknown }[] = [];
  try {
    atomic(() => {
      for (const job of batch) {
        try {
          results.push({ job, ok: true, value: job.run() });
        } catch (e) {
          results.push({ job, ok: false, value: e });
        }
      }
    });
  } catch (e) {
    for (const job of batch) job.reject(e);
    return;
  }
  for (const r of results) (r.ok ? r.job.resolve : r.job.reject)(r.value);
}

function enqueue<T>(run: () => T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    jobs.push({ run, resolve: resolve as (v: unknown) => void, reject });
    if (!flushTimer) flushTimer = setTimeout(flushSetWrites, 0);
  });
}

/** Personal bests per exercise, read once per workout (not the full history on every tick). */
const bestCache = new Map<string, Best>();
function historyBest(exerciseId: string, sessionId: string): Best {
  const key = `${sessionId}:${exerciseId}`;
  if (!bestCache.has(key)) bestCache.set(key, bestOf(exerciseHistory(exerciseId, sessionId)));
  return bestCache.get(key) ?? null;
}

/** Tests only. */
export function resetSetWritesForTests(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  jobs = [];
  bestCache.clear();
}

function mergeBest(a: Best, b: Best): Best {
  if (!a || !b) return a ?? b;
  return { weightKg: Math.max(a.weightKg, b.weightKg), e1rm: Math.max(a.e1rm, b.e1rm) };
}

export type TickedSet = { pr: PR | null; set: WorkoutSet | null };

export type TickInput = {
  sessionId: string;
  /** The exercise the set belongs to (in-memory rows from the live query). */
  item: ItemLike<WorkoutSet>;
  /** Every exercise of the workout, for "what is next" without a query. */
  items: readonly ItemLike<WorkoutSet>[];
  set: WorkoutSet;
  patch?: SetPatch;
  restS: number | null | undefined;
  unit: WeightUnit;
  now?: number;
};

const shownDone = (s: { id: string; doneAt: number | null }) =>
  optimisticSets.isDone(s.id, s.doneAt != null);

/**
 * The 1-tap log, optimistic: the tick is green and the rest timer runs in the same frame (no
 * SQLite on the tap path); the write follows in one batched transaction, then PR detection
 * against the cached bests. Resolves with the saved set and the PR, if any.
 */
export function tickSet(input: TickInput): Promise<TickedSet> {
  const { set, item, items, sessionId, unit } = input;
  const now = input.now ?? Date.now();
  // Already done as shown (double tap before the re-render): no second log, no second rest.
  if (shownDone(set)) return Promise.resolve({ pr: null, set: null });
  const patch = input.patch ?? {};
  optimisticSets.set(set.id, { done: true, patch });
  const next = nextAfter(items, set.id, shownDone, unit);
  if (next)
    restTimer.start(sessionId, defaultRestSeconds(input.restS, patch.type ?? set.type), next, now);

  return enqueue(() => {
    // Fresh state, not the render's: a stale double tap must not log twice.
    if (setsRepo.get(set.id)?.doneAt != null) return { pr: null, set: null } as TickedSet;
    const saved = setDone(set.id, true, patch, now) ?? null;
    return { pr: null, set: saved } as TickedSet;
  }).then(
    (res) => {
      if (!res.set) return res;
      const sameExercise = items
        .filter((i) => i.se.exerciseId === item.se.exerciseId)
        .flatMap((i) => i.sets)
        .filter((s) => s.id !== set.id && s.doneAt != null);
      const before = historyBest(item.se.exerciseId, sessionId);
      const pr = before ? detectPR(res.set, mergeBest(before, bestOf(sameExercise))) : null;
      track('set_logged', { type: res.set.type, has_rpe: res.set.rpe != null, pr: pr != null });
      return { pr, set: res.set };
    },
    (e: unknown) => {
      optimisticSets.clear(set.id);
      showToast({ message: "Couldn't save that set. Tap to try again.", tone: 'danger' });
      throw e;
    },
  );
}

/** Un-tick (the set stays, its values too); the rest keeps running. Resolves with the old time. */
export function untickSet(set: WorkoutSet, now: number = Date.now()): Promise<number | null> {
  if (!shownDone(set)) return Promise.resolve(null);
  optimisticSets.set(set.id, { done: false, patch: {} });
  return enqueue(() => {
    const prev = setsRepo.get(set.id)?.doneAt ?? null;
    if (prev == null) return null;
    setDone(set.id, false, {}, now);
    return prev;
  }).catch(() => {
    optimisticSets.clear(set.id);
    return null;
  });
}

/** Undo an un-tick: the set is done again at its original time. */
export function retickSet(setId: string, doneAt: number, now: number = Date.now()): void {
  optimisticSets.set(setId, { done: true, patch: {} });
  void enqueue(() => setsRepo.update(setId, { doneAt }, now)).catch(() =>
    optimisticSets.clear(setId),
  );
}

/**
 * Synchronous log (notifications, tests): same rules as `tickSet`, written immediately.
 * Returns the PR, if any.
 */
export function logSetAction(opts: {
  sessionId: string;
  set: WorkoutSet;
  patch?: SetPatch;
  restS: number | null | undefined;
  exerciseId: string;
  catalog: Catalog | null;
  unit: WeightUnit;
  now?: number;
}): PR | null {
  const now = opts.now ?? Date.now();
  // Fresh state, not the render's: a double tap before the list re-renders must not log twice.
  if (setsRepo.get(opts.set.id)?.doneAt != null) return null;
  const saved = setDone(opts.set.id, true, opts.patch ?? {}, now);
  if (!saved) return null;
  const meta = exerciseMeta(opts.exerciseId, opts.catalog);
  const sameIds = new Set(
    exercisesForSession(opts.sessionId)
      .filter((se) => se.exerciseId === opts.exerciseId)
      .map((se) => se.id),
  );
  const sameExercise = [...setsForSession(opts.sessionId).values()]
    .flat()
    .filter((s) => s.id !== saved.id && isDone(s) && sameIds.has(s.sessionExerciseId));
  const history: SetLike[] = exerciseHistory(opts.exerciseId, opts.sessionId);
  const pr = history.length > 0 ? detectPR(saved, bestOf([...history, ...sameExercise])) : null;

  const next = nextUp(opts.sessionId, saved.id, opts.catalog);
  if (next) {
    restTimer.start(opts.sessionId, defaultRestSeconds(opts.restS, saved.type), next, now);
  }
  if (pr) {
    showToast({
      message: `New PR · ${meta.name} ${formatWeight(pr.weightKg, opts.unit)} ${opts.unit}`,
      tone: 'success',
    });
  }
  track('set_logged', { type: saved.type, has_rpe: saved.rpe != null, pr: pr != null });
  return pr;
}

export function undoSetAction(set: WorkoutSet, now: number = Date.now()): void {
  if (setsRepo.get(set.id)?.doneAt == null) return; // already undone (double tap)
  setDone(set.id, false, {}, now);
}

/** Finish (F2 step 6): close any pause, save, end the rest, celebrate, fire workout_finished. */
export function finishWorkoutAction(
  sessionId: string,
  catalog: Catalog | null,
  unit: WeightUnit,
  now: number = Date.now(),
): void {
  flushSetWrites(); // ticks still in the queue are part of this workout
  const s = getSession(sessionId);
  if (!s) return;
  if (s.status === 'paused') resumeWorkoutAction(sessionId, now);
  const done = finishWorkout(sessionId, now);
  restTimer.clearFor(sessionId);
  releaseWorkoutAwake(sessionId);
  haptics.success();
  if (!done) return;
  const map = setsForSession(sessionId);
  const summary = buildSummary(
    done,
    exercisesForSession(sessionId).map((se) => {
      const meta = exerciseMeta(se.exerciseId, catalog);
      return {
        name: meta.name,
        pattern: meta.pattern,
        equipment: meta.equipment,
        targetReps: se.targetReps,
        cardio: meta.cardio,
        sets: map.get(se.id) ?? [],
        history: exerciseHistory(se.exerciseId, sessionId),
      };
    }),
    unit,
    now,
  );
  track('workout_finished', {
    duration_bucket: durationBucket(summary.durationMs),
    sets: summary.setsDone,
    prs: summary.prs.length,
  });
}

/** Discard (after the confirm): pending ticks land first, then everything goes in one transaction. */
export function discardWorkoutAction(
  sessionId: string,
  now: number = Date.now(),
): DiscardSnapshot | null {
  flushSetWrites();
  restTimer.clearFor(sessionId);
  releaseWorkoutAwake(sessionId);
  return discardWorkout(sessionId, now);
}
