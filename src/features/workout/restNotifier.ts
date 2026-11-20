/**
 * Bridges the workout rest timer to the lock-screen surfaces owned by the notifications feature
 * (`updateRestTimerSurface`): iOS Live Activity, Android ongoing chronometer notification and the
 * N-5 "Rest over" alert scheduled at the end time, so it fires with the app backgrounded or killed.
 * The in-app timer stays the source of truth; surfaces are best effort.
 */
import * as Notifications from 'expo-notifications';
import { AppState } from 'react-native';

import type { RestTimerState as SurfaceState } from '@/features/notifications';

import { remainingMs, type ActiveRest } from './logic/restTimer';
import { getSession } from './repo';
import { isFreshEnd, registerRestTimerSurface, type RestTimerSurface } from './restTimerStore';

export type SurfaceUpdate = (state: SurfaceState | null) => unknown;
/** Plays the "Rest over" cue now (sound + banner), after the surfaces were cleared. */
export type RestOverAlert = (last: ActiveRest) => unknown;

/** Same id as the scheduled N-5 alert, so the shade never holds two "Rest over" banners. */
export const REST_OVER_ID = 'rw:rest';

/** "Rest over" copy (same wording as the scheduled N-5 alert). Pure. */
export function restOverContent(last: Pick<ActiveRest, 'next'>): { title: string; body: string } {
  const n = last.next;
  const body =
    n?.exercise && n.setNo
      ? `Next: ${n.exercise} set ${n.setNo}`
      : n?.exercise
        ? `Next: ${n.exercise}`
        : 'Time for your next set';
  return { title: 'Rest over', body };
}

/**
 * The audible half of rest end (B5). The scheduled alert is cancelled when the rest ends in the
 * foreground (and Android delivers it late anyway), so present it now, on the high-priority
 * `timer` channel with the default sound. Only while the app is in the foreground: in the
 * background the scheduled alert fires by itself.
 */
export const presentRestOver: RestOverAlert = (last) => {
  if (AppState.currentState !== 'active') return undefined;
  const { title, body } = restOverContent(last);
  return Notifications.scheduleNotificationAsync({
    identifier: REST_OVER_ID,
    content: {
      title,
      body,
      sound: 'default',
      data: { kind: 'rest', url: '/train', sessionId: last.sessionId },
      interruptionLevel: 'timeSensitive',
    },
    trigger: { channelId: 'timer' },
  }).catch(() => undefined);
};

/** Workout timer state → the notifications feature's surface contract. Pure. */
export function toSurfaceState(
  state: ActiveRest,
  workoutTitle: string | null,
  now: number,
): SurfaceState {
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

export function createSurfaceBridge(
  update: SurfaceUpdate,
  clock: () => number = Date.now,
  alert: RestOverAlert | null = null,
): RestTimerSurface {
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
    end(reason, last) {
      let cleared: unknown;
      try {
        cleared = update(null);
      } catch {
        // best effort
      }
      // Rest over on time: the sound plays now, AFTER the clear cancelled the scheduled alert
      // (the old race: the cancel won and nothing was heard).
      if (reason !== 'done' || !alert || !isFreshEnd(last.endsAt, clock())) return;
      void Promise.resolve(cleared)
        .catch(() => undefined)
        .then(() => alert(last))
        .catch(() => undefined);
    },
  };
}

function loadUpdate(): SurfaceUpdate | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@/features/notifications/restTimer') as {
      updateRestTimerSurface?: SurfaceUpdate;
    };
    return typeof mod.updateRestTimerSurface === 'function' ? mod.updateRestTimerSurface : null;
  } catch {
    return null;
  }
}

let installed = false;

/** Install the lock-screen bridge once (called when the player mounts). */
export function installRestNotifier(
  update: SurfaceUpdate | null = loadUpdate(),
  alert: RestOverAlert | null = presentRestOver,
): boolean {
  if (installed || !update) return installed;
  registerRestTimerSurface(createSurfaceBridge(update, Date.now, alert));
  installed = true;
  return true;
}

export function resetRestNotifierForTests(): void {
  installed = false;
}
