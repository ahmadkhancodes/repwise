import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';

import { getAppPrefs, useAppPrefs } from '@/features/settings';

/** One keep-awake tag per workout, so no other screen's cleanup can turn it off (N2). */
export function workoutAwakeTag(sessionId: string): string {
  return `workout-${sessionId}`;
}

const counts = new Map<string, number>();

/**
 * Reference-counted keep-awake: the tag is activated on the first hold and deactivated only when
 * the last one is released. The returned release is idempotent. Best effort, never throws.
 */
export function acquireKeepAwake(tag: string): () => void {
  const n = counts.get(tag) ?? 0;
  counts.set(tag, n + 1);
  if (n === 0) activateKeepAwakeAsync(tag).catch(() => undefined);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const left = (counts.get(tag) ?? 1) - 1;
    if (left > 0) {
      counts.set(tag, left);
      return;
    }
    counts.delete(tag);
    Promise.resolve()
      .then(() => deactivateKeepAwake(tag))
      .catch(() => undefined);
  };
}

const holds = new Map<string, () => void>();

/**
 * The screen stays on for the whole active workout (B1, N2): held when it starts or resumes,
 * whichever screens mount or unmount meanwhile, and released only on pause, finish or discard.
 * Off when Settings → "Keep screen on" is off (N6). Idempotent per workout.
 */
export function holdWorkoutAwake(sessionId: string): void {
  if (holds.has(sessionId) || !getAppPrefs().keepAwake) return;
  holds.set(sessionId, acquireKeepAwake(workoutAwakeTag(sessionId)));
}

export function releaseWorkoutAwake(sessionId: string): void {
  const release = holds.get(sessionId);
  if (!release) return;
  holds.delete(sessionId);
  release();
}

/**
 * Player screens keep the hold in step with the workout and the setting (a workout restored after
 * an app kill, a pause from the notification, the setting switched mid-workout). Unmounting a
 * screen never releases it: only pause, finish or discard do.
 */
export function useWorkoutKeepAwake(sessionId: string | undefined, active: boolean): void {
  const keepAwake = useAppPrefs((s) => s.keepAwake);
  useEffect(() => {
    if (!sessionId) return;
    if (active && keepAwake) holdWorkoutAwake(sessionId);
    else releaseWorkoutAwake(sessionId);
  }, [sessionId, active, keepAwake]);
}

/** Tests only. */
export function resetKeepAwakeForTests(): void {
  counts.clear();
  holds.clear();
}
