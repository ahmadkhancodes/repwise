import { latestPlan } from '@/features/planner/repo';

import { activeMs } from '../logic/duration';
import {
  activeSession,
  doneSessionSummaries,
  exercisesForSessions,
  sessionsBetween,
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

const TABLES = ['sessions', 'session_exercises', 'plans'];

/**
 * Sessions planned/done in [from, to] with their exercise counts (Train → Week): 2 queries in all
 * (indexed date range + one IN query), and none while the tab is in the background.
 * Planned set counts come from the targets, so set ticks never re-run this.
 */
export function useWeekSessions(from: string, to: string, active = true, retry = 0) {
  return useLiveValue<{ cards: WeekSessionCard[]; blockNo: number | null }>(
    () => {
      const list = sessionsBetween(from, to);
      const byId = exercisesForSessions(list.map((s) => s.id));
      const cards = list.map((session) => {
        const ses = byId.get(session.id) ?? [];
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
    [from, to, retry],
    { active },
  );
}

export type HistoryEntry = {
  session: Session;
  durationMs: number;
  volumeKg: number;
  sets: number;
  exercises: number;
};

/**
 * Finished workouts, newest first, with duration/volume/sets (Train → History): ONE aggregate
 * query (A2). Mount it only while History is shown.
 */
export function useHistory(limit = 60, active = true) {
  return useLiveValue<HistoryEntry[]>(
    () =>
      doneSessionSummaries(limit).map((r) => ({
        session: r.session,
        durationMs: activeMs(r.session, r.session.endedAt ?? Date.now()),
        volumeKg: Math.round(r.volumeKg),
        sets: r.sets,
        exercises: r.exercises,
      })),
    ['sessions', 'session_exercises', 'sets'],
    [limit],
    { active },
  );
}

/** The workout in progress, if any (resume banner after a crash or a close). */
export function useActiveSession() {
  return useLiveValue<Session | null>(() => activeSession() ?? null, ['sessions'], []);
}
