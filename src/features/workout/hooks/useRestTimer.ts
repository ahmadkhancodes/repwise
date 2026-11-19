import { useEffect, useSyncExternalStore } from 'react';

import { haptics } from '@/services/haptics';

import { remainingMs, restProgress, type RestTimerState } from '../logic/restTimer';
import { restTimer } from '../restTimerStore';
import { useNow } from './useNow';

export type RestTimerView = {
  state: RestTimerState;
  remainingMs: number;
  progress: number;
};

/** Live rest timer for the UI: ticks 4×/s while running and ends it (with a haptic) at zero. */
export function useRestTimer(): RestTimerView {
  const state = useSyncExternalStore(restTimer.subscribe, restTimer.getState, restTimer.getState);
  const now = useNow(250, state.status === 'running');
  useEffect(() => {
    if (state.status === 'running' && restTimer.check(now)) haptics.success();
  }, [now, state.status]);
  return { state, remainingMs: remainingMs(state, now), progress: restProgress(state, now) };
}
