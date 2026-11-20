/**
 * Device preferences shown in Settings (S38) that are not profile data: workout comfort switches.
 * Per device (MMKV), never synced. Read with `useAppPrefs` in screens or `getAppPrefs()` in
 * services (rest timer, workout player).
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { zustandStorage } from '@/services/storage';

export type AppPrefs = {
  /** Keep the screen on while a workout is active (perf audit B1). Default on. */
  keepAwake: boolean;
  /** Sound with the "Rest over" alert (perf audit B5). Default on. */
  restSound: boolean;
  /** Strong vibration when a rest ends (perf audit B5). Default on. */
  restVibration: boolean;
};

export const DEFAULT_APP_PREFS: AppPrefs = {
  keepAwake: true,
  restSound: true,
  restVibration: true,
};

export const APP_PREFS_KEY = 'settings.prefs.v1';

/** Keep only known boolean keys; anything else falls back to the default. Pure. */
export function sanitizeAppPrefs(raw: unknown): AppPrefs {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = { ...DEFAULT_APP_PREFS };
  for (const key of Object.keys(DEFAULT_APP_PREFS) as (keyof AppPrefs)[]) {
    if (typeof src[key] === 'boolean') out[key] = src[key];
  }
  return out;
}

type State = AppPrefs & { setPref: <K extends keyof AppPrefs>(key: K, value: AppPrefs[K]) => void };

export const useAppPrefs = create<State>()(
  persist(
    (set) => ({
      ...DEFAULT_APP_PREFS,
      setPref: (key, value) => set({ [key]: value } as Partial<AppPrefs>),
    }),
    {
      name: APP_PREFS_KEY,
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
      partialize: (s) => sanitizeAppPrefs(s),
      merge: (persisted, current) => ({ ...current, ...sanitizeAppPrefs(persisted) }),
    },
  ),
);

/** Non-React read for services. */
export function getAppPrefs(): AppPrefs {
  return sanitizeAppPrefs(useAppPrefs.getState());
}
