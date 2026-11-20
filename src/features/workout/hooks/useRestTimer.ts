import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { remainingMs, restProgress, type RestTimerState } from '../logic/restTimer';
import { restTimer } from '../restTimerStore';

export type RestTimerView = {
  state: RestTimerState;
  remainingMs: number;
  progress: number;
};

/** The rest timer's state (start/±15/pause/end). Re-renders only on transitions, never per tick. */
export function useRestState(): RestTimerState {
  return useSyncExternalStore(restTimer.subscribe, restTimer.getState, restTimer.getState);
}

/**
 * Delay until the displayed whole second changes (the countdown rounds up), so a 1 Hz tick lands
 * right on the boundary instead of drifting up to a second late. Pure.
 */
export function msToNextSecond(remaining: number): number {
  if (remaining <= 0) return 1000;
  const r = remaining % 1000;
  return (r === 0 ? 1000 : r) + 8;
}

/**
 * Live countdown for ONE leaf component (rest bar, rest sheet): ticks at 1 Hz aligned to the
 * second boundary while running. The store ends the rest itself; this only renders it (A1).
 */
export function useRestCountdown(): RestTimerView {
  const state = useRestState();
  const [now, setNow] = useState(() => Date.now());
  const running = state.status === 'running';

  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    if (!running) return () => clearTimeout(first);
    let id: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const t = Date.now();
      id = setTimeout(
        () => {
          setNow(Date.now());
          schedule();
        },
        msToNextSecond(remainingMs(state, t)),
      );
    };
    schedule();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setNow(Date.now());
    });
    return () => {
      clearTimeout(first);
      clearTimeout(id);
      sub.remove();
    };
  }, [running, state]);

  // `now` can be a frame old right after a start or +15: never show more than the rest itself.
  const left = state.status === 'idle' ? 0 : Math.min(state.durationMs, remainingMs(state, now));
  return { state, remainingMs: left, progress: restProgress(state, now) };
}
