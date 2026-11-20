import { useMemo } from 'react';
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, max } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { useLiveRows } from '@/db/live';
import { createRepo, type Row } from '@/db/repo';
import { exercises, routines, sessionExercises, sessions, sets } from '@/db/schema';
import {
  createSession,
  sessionExercisesRepo,
  type Session,
  type SessionExercise,
} from '@/features/workout/repo';

import { draftToRow, type CustomExerciseDraft } from './logic/customExercise';
import type { LoggedSet } from './logic/records';
import type { RecentEntry } from './logic/recent';

/** User-created exercises (the catalogue is @repwise/content via src/services/catalog.ts). */
export const customExercisesRepo = createRepo(exercises, 'exercises');
export const routinesRepo = createRepo(routines, 'routines');
export type CustomExercise = Row<typeof exercises>;
export type Routine = Row<typeof routines>;

export function useCustomExercises(): CustomExercise[] {
  return customExercisesRepo.useLive(undefined, asc(exercises.name)).data;
}

export function useCustomExercisesLive(): { data: CustomExercise[]; error?: Error } {
  return customExercisesRepo.useLive(undefined, asc(exercises.name));
}

export function useRoutines(): Routine[] {
  return routinesRepo.useLive(undefined, asc(routines.name)).data;
}

// ---------------------------------------------------------------------------
// Custom exercises (RW-28)
// ---------------------------------------------------------------------------

export function createCustomExercise(d: CustomExerciseDraft, now?: number): CustomExercise {
  return customExercisesRepo.insert(draftToRow(d), now);
}

export function updateCustomExercise(
  id: string,
  d: CustomExerciseDraft,
  now?: number,
): CustomExercise | undefined {
  return customExercisesRepo.update(id, draftToRow(d), now);
}

/** Soft delete (syncs). Logged sets keep their exercise id, so history is never lost. */
export function deleteCustomExercise(id: string, now?: number): boolean {
  return customExercisesRepo.remove(id, now);
}

export function useCustomExercise(id: string): {
  row: CustomExercise | undefined;
  loaded: boolean;
} {
  const res = useLiveRows(
    () =>
      getDb()
        .select()
        .from(exercises)
        .where(and(eq(exercises.id, id), isNull(exercises.deletedAt))),
    ['exercises'],
    [id],
  );
  return { row: res.data[0] as CustomExercise | undefined, loaded: res.loaded };
}

// ---------------------------------------------------------------------------
// History, records and recently used (from logged sets)
// ---------------------------------------------------------------------------

const HISTORY_TABLES = ['sets', 'session_exercises', 'sessions'];

function historyQuery(exerciseId: string) {
  return getDb()
    .select({
      sessionId: sessionExercises.sessionId,
      date: sessions.date,
      type: sets.type,
      weightKg: sets.weightKg,
      reps: sets.reps,
      doneAt: sets.doneAt,
    })
    .from(sets)
    .innerJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
    .leftJoin(sessions, eq(sessionExercises.sessionId, sessions.id))
    .where(
      and(
        eq(sessionExercises.exerciseId, exerciseId),
        isNull(sets.deletedAt),
        isNull(sessionExercises.deletedAt),
        isNotNull(sets.doneAt),
      ),
    )
    .orderBy(desc(sets.doneAt));
}

export function exerciseHistory(exerciseId: string): LoggedSet[] {
  return historyQuery(exerciseId).all();
}

/** Live: re-runs whenever a set is logged, edited or deleted. */
export function useExerciseHistory(exerciseId: string): {
  sets: LoggedSet[];
  loaded: boolean;
  error?: Error;
} {
  const res = useLiveRows(() => historyQuery(exerciseId), HISTORY_TABLES, [exerciseId]);
  return { sets: res.data, loaded: res.loaded, error: res.error };
}

function recentQuery(limit: number) {
  const at = max(sets.doneAt);
  return getDb()
    .select({ id: sessionExercises.exerciseId, at })
    .from(sets)
    .innerJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
    .where(and(isNull(sets.deletedAt), isNull(sessionExercises.deletedAt), isNotNull(sets.doneAt)))
    .groupBy(sessionExercises.exerciseId)
    .orderBy(desc(at))
    .limit(limit);
}

export function recentlyLogged(limit = 20): RecentEntry[] {
  return recentQuery(limit)
    .all()
    .map((r) => ({ id: r.id, at: r.at ?? 0 }));
}

/**
 * Live, but only while the Library is focused (perf audit r2 N4): the GROUP BY over every done set
 * used to re-run on each set tick while the Library tab sat in the background.
 */
export function useRecentlyLogged(limit = 20): RecentEntry[] {
  const res = useLiveRows(() => recentQuery(limit), ['sets', 'session_exercises'], [limit]);
  return useMemo(() => res.data.map((r) => ({ id: r.id, at: r.at ?? 0 })), [res.data]);
}

// ---------------------------------------------------------------------------
// Add to workout (S19 primary action)
// ---------------------------------------------------------------------------

const OPEN: Session['status'][] = ['planned', 'active', 'paused'];

/** Today's and upcoming sessions that are not finished, soonest first. */
function openSessionsQuery(today: string, limit: number) {
  return getDb()
    .select()
    .from(sessions)
    .where(
      and(
        isNull(sessions.deletedAt),
        gte(sessions.date, today),
        inArray(sessions.status, OPEN as NonNullable<Session['status']>[]),
      ),
    )
    .orderBy(asc(sessions.date), asc(sessions.createdAt))
    .limit(limit);
}

export function openSessions(today: string, limit = 6): Session[] {
  return openSessionsQuery(today, limit).all() as Session[];
}

export function useOpenSessions(today: string, limit = 6): Session[] {
  return useLiveRows(() => openSessionsQuery(today, limit), ['sessions'], [today, limit])
    .data as Session[];
}

/** Default target for an exercise added by hand; the player lets the user change it. */
export const ADDED_TARGET_SETS = 3;

/** Title of a workout started from an exercise page when nothing is planned. */
export const QUICK_WORKOUT_TITLE = 'Quick workout';

/** No plan today: a new ad-hoc session for `today` holding just this exercise (local, instant). */
export function startWorkoutWithExercise(exerciseId: string, today: string, now?: number): Session {
  return createSession(
    {
      date: today,
      title: QUICK_WORKOUT_TITLE,
      exercises: [{ exerciseId, targetSets: ADDED_TARGET_SETS }],
    },
    now,
  );
}

/** Append to the end of a session (local, instant). */
export function addExerciseToSession(
  sessionId: string,
  exerciseId: string,
  now?: number,
): SessionExercise {
  const position = sessionExercisesRepo.list(eq(sessionExercises.sessionId, sessionId)).length;
  return sessionExercisesRepo.insert(
    { sessionId, exerciseId, position, targetSets: ADDED_TARGET_SETS },
    now,
  );
}
