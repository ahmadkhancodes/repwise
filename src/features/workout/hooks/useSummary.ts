import type { Catalog } from '@/services/catalog';

import { exerciseMeta } from '../exerciseMeta';
import type { WeightUnit } from '../logic/engine';
import { buildSummary, type WorkoutSummary } from '../logic/summary';
import { exerciseHistory, exercisesForSession, getSession, setsForSession, type Session } from '../repo';
import { useLiveValue } from './useLiveValue';

/** S35 data: the finished session plus PRs and next-time suggestions (engine). */
export function useSummary(sessionId: string, catalog: Catalog | null, unit: WeightUnit) {
  return useLiveValue<{ session: Session; summary: WorkoutSummary } | null>(
    () => {
      const session = getSession(sessionId);
      if (!session) return null;
      const map = setsForSession(sessionId);
      const items = exercisesForSession(sessionId).map((se) => {
        const meta = exerciseMeta(se.exerciseId, catalog);
        return {
          name: meta.name,
          pattern: meta.pattern,
          equipment: meta.equipment,
          targetReps: se.targetReps,
          cardio: meta.cardio,
          sets: map.get(se.id) ?? [],
          history: exerciseHistory(se.exerciseId, sessionId),
        };
      });
      return { session, summary: buildSummary(session, items, unit, session.endedAt ?? Date.now()) };
    },
    ['sessions', 'sets'],
    [sessionId, catalog, unit],
  );
}
