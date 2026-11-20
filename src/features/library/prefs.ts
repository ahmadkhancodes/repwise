/**
 * Library preferences on this device (MMKV): favourite exercise ids and recently opened exercises.
 * Small preferences, not workout data, so they stay out of SQLite/sync (see DECISIONS "library").
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { zustandStorage } from '@/services/storage';

import { pushViewed, type RecentEntry } from './logic/recent';

type LibraryPrefs = {
  favourites: string[];
  viewed: RecentEntry[];
  /** "Never suggest this" from the exercise swap sheet (W4): kept out of swaps and new plans. */
  neverSuggest: string[];
  setNeverSuggest: (id: string, never: boolean) => void;
  toggleFavourite: (id: string) => boolean;
  markViewed: (id: string, at?: number) => void;
  forget: (id: string) => void;
};

export const useLibraryPrefs = create<LibraryPrefs>()(
  persist(
    (set, get) => ({
      favourites: [],
      viewed: [],
      neverSuggest: [],
      setNeverSuggest: (id, never) =>
        set((s) => ({
          neverSuggest: never
            ? s.neverSuggest.includes(id)
              ? s.neverSuggest
              : [...s.neverSuggest, id]
            : s.neverSuggest.filter((n) => n !== id),
        })),
      /** Returns the new state (true = now a favourite). Newest favourite first. */
      toggleFavourite: (id) => {
        const on = !get().favourites.includes(id);
        set((s) => ({
          favourites: on ? [id, ...s.favourites] : s.favourites.filter((f) => f !== id),
        }));
        return on;
      },
      markViewed: (id, at = Date.now()) => set((s) => ({ viewed: pushViewed(s.viewed, id, at) })),
      /** A deleted custom exercise leaves no trace in favourites or recents. */
      forget: (id) =>
        set((s) => ({
          favourites: s.favourites.filter((f) => f !== id),
          viewed: s.viewed.filter((v) => v.id !== id),
        })),
    }),
    {
      name: 'library.prefs.v1',
      storage: createJSONStorage(() => zustandStorage),
      partialize: (s) => ({
        favourites: s.favourites,
        viewed: s.viewed,
        neverSuggest: s.neverSuggest,
      }),
    },
  ),
);

export function useIsFavourite(id: string): boolean {
  return useLibraryPrefs((s) => s.favourites.includes(id));
}

/** Exercise ids the user asked us never to suggest (swap sheet). Stable array until it changes. */
export function neverSuggestedExercises(): readonly string[] {
  return useLibraryPrefs.getState().neverSuggest;
}
