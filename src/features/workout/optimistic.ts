/**
 * Optimistic set state (A3): a tap paints the tick green in the same frame, before SQLite is
 * touched. Entries live until the live query shows the same `done` state, then they are cleared,
 * so there is never a flicker back to the old value between the write and the re-query.
 */
import { useSyncExternalStore } from 'react';

import type { SetPatch } from './repo';

export type PendingSet = {
  done: boolean;
  /** Values the tap wrote with it (ghosted previous taken over, editor values). */
  patch: SetPatch;
};

const entries = new Map<string, PendingSet>();
const listeners = new Set<() => void>();
let version = 0;

function emit(): void {
  version++;
  for (const l of [...listeners]) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export const optimisticSets = {
  get(id: string): PendingSet | undefined {
    return entries.get(id);
  },
  set(id: string, p: PendingSet): void {
    entries.set(id, p);
    emit();
  },
  /** Drop an entry (the DB caught up, or the write failed). */
  clear(id: string): void {
    if (entries.delete(id)) emit();
  },
  /** `done` as the user sees it: the pending tap wins over the stored row. */
  isDone(id: string, storedDone: boolean): boolean {
    return entries.get(id)?.done ?? storedDone;
  },
  subscribe,
  version: () => version,
};

/** One set's pending state (re-renders only that row's subscribers). */
export function useOptimisticSet(id: string): PendingSet | undefined {
  return useSyncExternalStore(
    subscribe,
    () => entries.get(id),
    () => entries.get(id),
  );
}

/** Re-render when any pending entry changes (the footer's "Log set N" and the progress header). */
export function useOptimisticVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => version,
  );
}

/** Tests only. */
export function resetOptimisticForTests(): void {
  entries.clear();
  emit();
}
