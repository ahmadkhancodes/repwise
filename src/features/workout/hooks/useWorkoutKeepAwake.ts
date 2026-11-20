import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';

export const KEEP_AWAKE_TAG = 'workout';

/**
 * The screen stays on while a workout is running (B1): no unlock with sweaty fingers between
 * sets. A paused or finished workout lets the phone sleep again. Best effort, never throws.
 */
export function useWorkoutKeepAwake(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    return () => {
      Promise.resolve()
        .then(() => deactivateKeepAwake(KEEP_AWAKE_TAG))
        .catch(() => undefined);
    };
  }, [active]);
}
