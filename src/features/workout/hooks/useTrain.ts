import { latestPlan } from '@/features/planner/repo';

import { activeMs } from '../logic/duration';
import { volumeKg } from '../logic/sets';
import {
  activeSession,
  doneSessions,
  exercisesForSession,
  sessionsBetween,
  setsForSession,
  type Session,
} from '../repo';
import { useLiveValue } from './useLiveValue';

export type WeekSessionCard = {
  session: Session;
  exerciseIds: string[];
  totalSets: number;
  restS: (number | null)[];
  setsPerExercise: number[];
};

const TABLES = ['sessions', 'session_exercises', 'sets', 'plans'];

/** Sessions planned/done in [from, to] with their exercise counts (Train → Week). */
export function useWeekSessions(from: string, to: string) {
  return useLiveValue<{ cards: WeekSessionCard[]; blockNo: number | null }>(
    () => {
      const cards = sessionsBetween(from, to).map((session) => {
        const ses = exercisesForSession(session.id);
        return {
          session,
          exerciseIds: ses.map((e) => e.exerciseId),
          totalSets: ses.reduce((a, e) => a + (e.targetSets ?? 3), 0),
          restS: ses.map((e) => e.restS),
          setsPerExercise: ses.map((e) => e.targetSets ?? 3),
        };
      });
      let blockNo: number | null = null;
      try {
        blockNo = latestPlan('training')?.blockNo ?? null;
      } catch {
        blockNo = null;
      }
      return { cards, blockNo };
    },
    TABLES,
    [from, to],
  );
}

export type HistoryEntry = { session: Session; durationMs: number; volumeKg: number; sets: number; exercises: number };

/** Finished workouts, newest first, with duration/volume/sets (Train → History). */
export function useHistory(limit = 60) {
  return useLiveValue<HistoryEntry[]>(
    () =>
      doneSessions(limit).map((session) => {
        const all = [...setsForSession(session.id).values()].flat();
        return {
          session,
          durationMs: activeMs(session, session.endedAt ?? Date.now()),
          volumeKg: Math.round(volumeKg(all)),
          sets: all.filter((s) => s.doneAt != null).length,
          exercises: exercisesForSession(session.id).length,
        };
      }),
    ['sessions', 'sets'],
    [limit],
  );
}

/** The workout in progress, if any (resume banner after a crash or a close). */
export function useActiveSession() {
  return useLiveValue<Session | null>(() => activeSession() ?? null, ['sessions'], []);
}
