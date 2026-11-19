/**
 * The rest timer service (RW-23, W5). One timer app-wide, persisted to MMKV on every change so
 * it survives the app being killed; all times derive from timestamps.
 *
 * Public API for other features (the notifications/widgets agent builds the iOS Live Activity and
 * the native Android chronometer on top of this):
 *   restTimer.getState() / restTimer.subscribe(listener)   — read + follow the state
 *   registerRestTimerSurface({ start, update, end })       — get called on every transition
 * The default surface (restNotifier.ts) schedules the local "Rest over" notification and keeps an
 * ongoing notification on Android.
 */
import { kv } from '@/services/storage';

import {
  IDLE,
  adjustRest,
  isOver,
  pauseRest,
  resumeRest,
  reviveRest,
  startRest,
  type ActiveRest,
  type RestNext,
  type RestTimerState,
} from './logic/restTimer';

export type RestEndReason = 'done' | 'skipped' | 'replaced';

/** A place that mirrors the timer outside the app UI (notification, Live Activity, widget). */
export type RestTimerSurface = {
  start(state: ActiveRest): void;
  update(state: ActiveRest): void;
  end(reason: RestEndReason, last: ActiveRest): void;
};

const KEY = 'workout.restTimer.v1';

function load(): RestTimerState {
  try {
    const raw = kv.getString(KEY);
    return raw ? reviveRest(JSON.parse(raw)) : IDLE;
  } catch {
    return IDLE;
  }
}

let state: RestTimerState = load();
const listeners = new Set<(s: RestTimerState) => void>();
const surfaces = new Set<RestTimerSurface>();

function each(fn: (s: RestTimerSurface) => void): void {
  for (const s of [...surfaces]) {
    try {
      fn(s);
    } catch {
      // a surface (notification, Live Activity) must never break the timer
    }
  }
}

function commit(next: RestTimerState): void {
  state = next;
  try {
    if (next.status === 'idle') kv.remove(KEY);
    else kv.set(KEY, JSON.stringify(next));
  } catch {
    // persistence is best-effort; the timer still runs in memory
  }
  for (const l of [...listeners]) l(next);
}

function end(reason: RestEndReason): void {
  if (state.status === 'idle') return;
  const last = state;
  commit(IDLE);
  each((s) => s.end(reason, last));
}

export const restTimer = {
  getState(): RestTimerState {
    return state;
  },
  subscribe(listener: (s: RestTimerState) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** Start a rest (auto-started on a set tick). Replaces any running rest. */
  start(sessionId: string, seconds: number, next: RestNext | null = null, now: number = Date.now()): void {
    if (state.status !== 'idle') end('replaced');
    const s = startRest(now, seconds, sessionId, next);
    if (s.durationMs <= 0) return;
    commit(s);
    each((x) => x.start(s));
  },
  /** ±15 s. Going to zero ends the rest. */
  add(deltaS: number, now: number = Date.now()): void {
    const next = adjustRest(state, deltaS, now);
    if (next.status === 'idle') return end('skipped');
    commit(next);
    each((x) => x.update(next));
  },
  pause(now: number = Date.now()): void {
    const next = pauseRest(state, now);
    if (next === state || next.status === 'idle') return;
    commit(next);
    each((x) => x.update(next));
  },
  resume(now: number = Date.now()): void {
    const next = resumeRest(state, now);
    if (next === state || next.status === 'idle') return;
    commit(next);
    each((x) => x.update(next));
  },
  skip(): void {
    end('skipped');
  },
  /** Called by the UI clock and on foreground: ends the rest once its time is up. True if it ended. */
  check(now: number = Date.now()): boolean {
    if (!isOver(state, now)) return false;
    end('done');
    return true;
  },
  /** Ends a rest that belongs to a finished/discarded workout. */
  clearFor(sessionId: string): void {
    if (state.status !== 'idle' && state.sessionId === sessionId) end('skipped');
  },
};

/** Add a surface; returns an unregister function. Re-announces a running rest to the newcomer. */
export function registerRestTimerSurface(surface: RestTimerSurface): () => void {
  surfaces.add(surface);
  if (state.status !== 'idle') {
    try {
      surface.start(state);
    } catch {
      // ignore
    }
  }
  return () => {
    surfaces.delete(surface);
  };
}

/** Tests only. */
export function resetRestTimerForTests(): void {
  state = IDLE;
  listeners.clear();
  surfaces.clear();
  try {
    kv.remove(KEY);
  } catch {
    // ignore
  }
}

/** Tests only: re-read the persisted value as a cold start would. */
export function reloadRestTimerForTests(): RestTimerState {
  state = load();
  return state;
}
