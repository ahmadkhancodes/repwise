import { createMMKV, type MMKV } from 'react-native-mmkv';
import type { StateStorage } from 'zustand/middleware';

/**
 * Fast key-value storage for flags and small preferences (never user data —
 * that lives in SQLite). Falls back to memory if MMKV cannot start, so the UI
 * never crashes on a storage problem.
 */
function open(): Pick<MMKV, 'getString' | 'set' | 'remove'> {
  try {
    return createMMKV({ id: 'repwise' });
  } catch {
    const mem = new Map<string, string>();
    return {
      getString: (k: string) => mem.get(k),
      set: (k: string, v: string | number | boolean | ArrayBuffer) => {
        mem.set(k, String(v));
      },
      remove: (k: string) => mem.delete(k),
    };
  }
}

export const kv = open();

/** zustand `persist` adapter backed by MMKV. */
export const zustandStorage: StateStorage = {
  getItem: (name) => kv.getString(name) ?? null,
  setItem: (name, value) => kv.set(name, value),
  removeItem: (name) => {
    kv.remove(name);
  },
};
