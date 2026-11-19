import { create } from 'zustand';

import { kv } from '@/services/storage';

import { sanitizePrefs, type NotificationPrefs } from './logic/prefs';

export const PREFS_KEY = 'notifications.prefs.v1';

function read(): NotificationPrefs {
  try {
    const raw = kv.getString(PREFS_KEY);
    return sanitizePrefs(raw ? JSON.parse(raw) : null);
  } catch {
    return sanitizePrefs(null);
  }
}

type PrefsState = {
  prefs: NotificationPrefs;
  set: <K extends keyof NotificationPrefs>(key: K, value: NotificationPrefs[K]) => void;
  setMealTime: (slot: keyof NotificationPrefs['mealTimes'], hm: string) => void;
};

/** Notification preferences (per device, MMKV). Every change triggers a schedule rebuild. */
export const useNotificationPrefs = create<PrefsState>()((set, get) => {
  const save = (prefs: NotificationPrefs) => {
    const clean = sanitizePrefs(prefs);
    try {
      kv.set(PREFS_KEY, JSON.stringify(clean));
    } catch {
      // memory state still updates; MMKV failure is not fatal
    }
    set({ prefs: clean });
  };
  return {
    prefs: read(),
    set: (key, value) => save({ ...get().prefs, [key]: value }),
    setMealTime: (slot, hm) => save({ ...get().prefs, mealTimes: { ...get().prefs.mealTimes, [slot]: hm } }),
  };
});

export function getPrefs(): NotificationPrefs {
  return useNotificationPrefs.getState().prefs;
}

/** Tests only. */
export function reloadPrefsForTests(): void {
  useNotificationPrefs.setState({ prefs: read() });
}
