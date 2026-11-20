import { useMemo } from 'react';

import type { Catalog } from '@/services/catalog';

import { exerciseMeta, type ExerciseMeta } from '../exerciseMeta';
import { setLabels } from '../logic/sets';
import {
  exercisesForSession,
  getSession,
  previousSets,
  setsForSession,
  type Session,
  type SessionExercise,
  type WorkoutSet,
} from '../repo';
import { useLiveValue } from './useLiveValue';

export type PlayerItem = {
  se: SessionExercise;
  meta: ExerciseMeta;
  sets: WorkoutSet[];
  labels: string[];
  /** Last finished session's sets for this exercise (ghosted "Previous"). */
  previous: WorkoutSet[];
};

export type WorkoutData = { session: Session | null; items: PlayerItem[] };

const TABLES = ['sessions', 'session_exercises', 'sets'];

/** Everything the player shows, live from SQLite. "Previous" is cached per exercise id. */
export function useWorkout(sessionId: string, catalog: Catalog | null) {
  // Previous sets never change during a workout: one history query per exercise id.
  const prevCache = useMemo(
    () => ({ sessionId, map: new Map<string, WorkoutSet[]>() }),
    [sessionId],
  ).map;
  // Structural sharing (A1): an exercise whose rows did not change keeps the same item object,
  // so its memoised card and rows skip the re-render after another exercise's write.
  const itemCache = useMemo(
    () => ({ sessionId, catalog, map: new Map<string, { sig: string; item: PlayerItem }>() }),
    [sessionId, catalog],
  ).map;

  return useLiveValue<WorkoutData>(
    () => {
      const session = getSession(sessionId) ?? null;
      if (!session) return { session: null, items: [] };
      const map = setsForSession(sessionId);
      const items = exercisesForSession(sessionId).map((se) => {
        let previous = prevCache.get(se.exerciseId);
        if (!previous) {
          previous = previousSets(se.exerciseId, sessionId);
          prevCache.set(se.exerciseId, previous);
        }
        const sets = map.get(se.id) ?? [];
        const sig = `${se.updatedAt}|${sets.map((x) => `${x.id}:${x.updatedAt}`).join(',')}`;
        const hit = itemCache.get(se.id);
        if (hit && hit.sig === sig) return hit.item;
        const item = {
          se,
          meta: exerciseMeta(se.exerciseId, catalog),
          sets,
          labels: setLabels(sets),
          previous,
        };
        itemCache.set(se.id, { sig, item });
        return item;
      });
      return { session, items };
    },
    TABLES,
    [sessionId, catalog, prevCache, itemCache],
  );
}
