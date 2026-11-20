/**
 * Rest timer → lock-screen surfaces (W5, RW-23, N-5). PURE: decides what the iOS Live Activity,
 * the Android ongoing chronometer notification and the "Rest over" alert should show.
 */
import { copy } from './copy';

/**
 * Contract with the workout player (feature `workout`, S14). The player owns the timer; it
 * publishes its state here (or through `connectRestTimer(api)`). `null` = no rest running.
 */
export type RestTimerState = {
  sessionId: string | null;
  workoutTitle: string | null;
  /** When this rest started (ms). */
  startedAt: number;
  /** When it ends (ms, absolute so it survives backgrounding; ±15 s moves it). */
  endsAt: number;
  /** Paused: the countdown is frozen at `remainingMs`. */
  paused: boolean;
  remainingMs: number | null;
  nextExercise: string | null;
  nextSet: number | null;
};

/** Minimal observable the workout agent's `restTimer` exposes. */
export interface RestTimerApi {
  subscribe(listener: (state: RestTimerState | null) => void): () => void;
}

/** Sent to the native module (same field names as the Swift/Kotlin `RestTimerPayload`). */
export type TimerSurfacePayload = {
  workoutTitle: string;
  sessionId: string | null;
  startedAt: number;
  endsAt: number;
  paused: boolean;
  remainingMs: number;
  nextExercise: string | null;
  nextSet: number | null;
  /** Android notification title/body. */
  title: string;
  body: string;
};

export type RestSurfacePlan =
  | { type: 'end' }
  | {
      type: 'show';
      payload: TimerSurfacePayload;
      /** When to fire N-5 "Rest over" (null while paused or already over). */
      alertAt: number | null;
      alert: { title: string; body: string };
    };

export const REST_ALERT_ID = 'rw:rest';

/**
 * Android fixes a channel's sound when it is created, so "Rest timer sound" off picks a second,
 * silent channel (N6). iOS reads `sound` per alert and ignores the channel. Pure.
 */
export function restAlertChannel(restSound: boolean): 'timer' | 'timer-silent' {
  return restSound ? 'timer' : 'timer-silent';
}

function mmss(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function planRestSurface(state: RestTimerState | null, now: number): RestSurfacePlan {
  if (!state) return { type: 'end' };
  const remaining = state.paused ? Math.max(0, state.remainingMs ?? 0) : state.endsAt - now;
  if (!state.paused && remaining <= 0) return { type: 'end' };
  const next = copy.restOverBody(state.nextExercise, state.nextSet);
  return {
    type: 'show',
    payload: {
      workoutTitle: state.workoutTitle || 'Workout',
      sessionId: state.sessionId,
      startedAt: state.startedAt,
      endsAt: state.paused ? now + remaining : state.endsAt,
      paused: state.paused,
      remainingMs: remaining,
      nextExercise: state.nextExercise,
      nextSet: state.nextSet,
      title: state.paused ? `Rest paused · ${mmss(remaining)} left` : 'Resting',
      body: next,
    },
    alertAt: state.paused ? null : state.endsAt,
    alert: { title: copy.restOverTitle, body: next },
  };
}
