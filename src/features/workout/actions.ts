/**
 * Workout actions: repo writes + rest timer + haptics + analytics in one place, so screens stay
 * thin and every path (list, exercise screen, notification) behaves the same.
 */
import { haptics } from '@/services/haptics';
import { track } from '@/services/analytics';
import type { Catalog } from '@/services/catalog';
import { kv } from '@/services/storage';
import { showToast } from '@/ui';

import { exerciseMeta } from './exerciseMeta';
import { durationBucket } from './logic/duration';
import { bestOf, detectPR, type PR } from './logic/prs';
import { defaultRestSeconds, type RestNext } from './logic/restTimer';
import { isDone, setLabels, type SetLike } from './logic/sets';
import { buildSummary } from './logic/summary';
import { formatWeight } from './logic/units';
import type { WeightUnit } from './logic/engine';
import {
  activeSession,
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
export function startWorkoutAction(sessionId: string, catalog: Catalog | null, now: number = Date.now()): StartResult {
  const running = activeSession();
  if (running && running.id !== sessionId) {
    showToast({ message: 'Finish or discard the workout in progress first' });
    return { started: false, activeSessionId: running.id };
  }
  const before = getSession(sessionId);
  const s = startWorkout(sessionId, (id) => exerciseMeta(id, catalog).cardio, now);
  if (s && before?.status === 'planned') {
    track('workout_started', { source: before.planId ? 'plan' : 'custom', exercises: exercisesForSession(sessionId).length });
  }
  return { started: true };
}

export function pauseWorkoutAction(sessionId: string, now: number = Date.now()): void {
  try {
    kv.set(pauseKey(sessionId), String(now));
  } catch {
    // without the timestamp the pause simply counts as active time
  }
  pauseWorkout(sessionId, now);
  restTimer.pause(now);
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
}

/** Who comes next after `setId` (for the rest timer + "Rest over" notification copy). */
export function nextUp(
  sessionId: string,
  setId: string,
  catalog: Catalog | null,
): RestNext | null {
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
        return { exercise: exerciseMeta(se.exerciseId, catalog).name, setNo: Number.isFinite(n) ? n : i + 1 };
      }
    }
  }
  return null;
}

/**
 * The 1-tap log (RW-20/22/23): mark the set done with the values shown, start the rest timer,
 * and celebrate a PR. Returns the PR, if any. Everything is local and synchronous.
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
    haptics.success();
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
  const s = getSession(sessionId);
  if (!s) return;
  if (s.status === 'paused') resumeWorkoutAction(sessionId, now);
  const done = finishWorkout(sessionId, now);
  restTimer.clearFor(sessionId);
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
