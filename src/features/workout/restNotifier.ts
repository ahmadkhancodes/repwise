/**
 * Bridges the workout rest timer to the lock-screen surfaces owned by the notifications feature
 * (`updateRestTimerSurface`): iOS Live Activity, Android ongoing chronometer notification and the
 * N-5 "Rest over" alert scheduled at the end time, so it fires with the app backgrounded or killed.
 * The in-app timer stays the source of truth; surfaces are best effort.
 */
import type { RestTimerState as SurfaceState } from '@/features/notifications';

import { remainingMs, type ActiveRest } from './logic/restTimer';
import { getSession } from './repo';
import { registerRestTimerSurface, type RestTimerSurface } from './restTimerStore';

export type SurfaceUpdate = (state: SurfaceState | null) => unknown;

/** Workout timer state → the notifications feature's surface contract. Pure. */
export function toSurfaceState(state: ActiveRest, workoutTitle: string | null, now: number): SurfaceState {
  const paused = state.status === 'paused';
  return {
    sessionId: state.sessionId,
    workoutTitle,
    startedAt: state.startedAt,
    endsAt: state.endsAt,
    paused,
    remainingMs: paused ? remainingMs(state, now) : null,
    nextExercise: state.next?.exercise ?? null,
    nextSet: state.next?.setNo ?? null,
  };
}

function titleOf(sessionId: string): string | null {
  try {
    return getSession(sessionId)?.title ?? null;
  } catch {
    return null;
  }
}

export function createSurfaceBridge(update: SurfaceUpdate, clock: () => number = Date.now): RestTimerSurface {
  const publish = (s: ActiveRest) => {
    try {
      void update(toSurfaceState(s, titleOf(s.sessionId), clock()));
    } catch {
      // best effort
    }
  };
  return {
    start: publish,
    update: publish,
    end() {
      try {
        void update(null);
      } catch {
        // best effort
      }
    },
  };
}

function loadUpdate(): SurfaceUpdate | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@/features/notifications/restTimer') as { updateRestTimerSurface?: SurfaceUpdate };
    return typeof mod.updateRestTimerSurface === 'function' ? mod.updateRestTimerSurface : null;
  } catch {
    return null;
  }
}

let installed = false;

/** Install the lock-screen bridge once (called when the player mounts). */
export function installRestNotifier(update: SurfaceUpdate | null = loadUpdate()): boolean {
  if (installed || !update) return installed;
  registerRestTimerSurface(createSurfaceBridge(update));
  installed = true;
  return true;
}

export function resetRestNotifierForTests(): void {
  installed = false;
}
