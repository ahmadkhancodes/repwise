/**
 * When sync runs (sheet 13), never on the UI's critical path:
 * - after local writes: push, debounced 2 s;
 * - app foreground: push, and pull at most every 5 min;
 * - app background: push;
 * - sign-in: full pull + push; sign-out: stop and forget the cursor.
 */
import { AppState, type AppStateStatus } from 'react-native';

import { onLocalWrite } from '@/db/events';
import { onSessionEvent } from '@/services/sessionEvents';

import { resetPullCursor, syncNow, useSyncStatus } from './syncEngine';

export const PUSH_DEBOUNCE_MS = 2000;
export const PULL_MIN_INTERVAL_MS = 5 * 60_000;

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
    }, PUSH_DEBOUNCE_MS);
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
