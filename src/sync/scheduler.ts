/**
 * When sync runs (sheet 13), never on the UI's critical path:
 * - after local writes: push, debounced 2 s; 30 s while a workout is active (perf audit r2 N20:
 *   a push 2 s after every set landed mid-rest, and its settle echoed into the player), flushed
 *   by finish/discard (the session leaves `active`, so the next write uses 2 s) and on background;
 * - app foreground: push, and pull at most every 5 min;
 * - app background: push;
 * - sign-in: full pull + push; sign-out: stop and forget the cursor.
 */
import { AppState, type AppStateStatus } from 'react-native';

import { getRawDb } from '@/db/client';
import { onLocalWrite } from '@/db/events';
import { onSessionEvent } from '@/services/sessionEvents';

import { resetPullCursor, syncNow, useSyncStatus } from './syncEngine';

export const PUSH_DEBOUNCE_MS = 2000;
export const PUSH_DEBOUNCE_WORKOUT_MS = 30_000;
export const PULL_MIN_INTERVAL_MS = 5 * 60_000;

/** True while a workout is in progress (one indexed lookup; never throws). */
export function workoutInProgress(): boolean {
  try {
    return (
      getRawDb().getFirstSync(
        "SELECT 1 AS x FROM sessions WHERE status = 'active' AND deleted_at IS NULL LIMIT 1",
      ) != null
    );
  } catch {
    return false;
  }
}

/** Pure: push debounce for the current state. */
export function pushDebounceMs(inWorkout: boolean): number {
  return inWorkout ? PUSH_DEBOUNCE_WORKOUT_MS : PUSH_DEBOUNCE_MS;
}

/** Pure: should a foreground sync also pull? */
export function shouldPull(lastPullAt: number | null, now: number): boolean {
  return lastPullAt === null || now - lastPullAt >= PULL_MIN_INTERVAL_MS;
}

let stopFn: (() => void) | null = null;

export function startSync(): () => void {
  if (stopFn) return stopFn;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const offWrite = onLocalWrite(() => {
    clear();
    timer = setTimeout(() => {
      timer = null;
      void syncNow({ pull: false });
    }, pushDebounceMs(workoutInProgress()));
  });

  const onAppState = (s: AppStateStatus) => {
    if (s === 'active') {
      void syncNow({ pull: shouldPull(useSyncStatus.getState().lastPullAt, Date.now()) });
    } else if (s === 'background') {
      clear();
      void syncNow({ pull: false });
    }
  };
  const appSub = AppState.addEventListener('change', onAppState);

  const offSession = onSessionEvent((e) => {
    if (e.type === 'signedIn' && !e.anonymous) {
      // New sign-in: restore everything this account has, then back up local rows.
      resetPullCursor(e.userId);
      void syncNow({ pull: true });
    } else if (e.type === 'signedOut') {
      clear();
      useSyncStatus.setState({ lastSyncAt: null, lastPullAt: null, lastError: null });
    }
  });

  // Cold start counts as a foreground.
  onAppState('active');

  stopFn = () => {
    clear();
    offWrite();
    offSession();
    appSub.remove();
    stopFn = null;
  };
  return stopFn;
}
