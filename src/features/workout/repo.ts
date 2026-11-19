import { asc, eq } from 'drizzle-orm';

import { createRepo, type NewRow, type Row } from '@/db/repo';
import { sessionExercises, sessions, sets } from '@/db/schema';

export const sessionsRepo = createRepo(sessions, 'sessions');
export const sessionExercisesRepo = createRepo(sessionExercises, 'session_exercises');
export const setsRepo = createRepo(sets, 'sets');
export type Session = Row<typeof sessions>;
export type SessionExercise = Row<typeof sessionExercises>;
export type WorkoutSet = Row<typeof sets>;

export function sessionsForDate(date: string): Session[] {
  return sessionsRepo.list(eq(sessions.date, date), asc(sessions.createdAt));
}

export function exercisesForSession(sessionId: string): SessionExercise[] {
  return sessionExercisesRepo.list(eq(sessionExercises.sessionId, sessionId), asc(sessionExercises.position));
}

export function setsFor(sessionExerciseId: string): WorkoutSet[] {
  return setsRepo.list(eq(sets.sessionExerciseId, sessionExerciseId), asc(sets.idx));
}

/** Core action (S14): log one set, local and instant; next index follows the existing sets. */
export function logSet(
  values: Omit<NewRow<typeof sets>, 'idx' | 'doneAt'> & { idx?: number },
  now: number = Date.now(),
): WorkoutSet {
  const idx = values.idx ?? setsFor(values.sessionExerciseId).length;
  return setsRepo.insert({ ...values, idx, doneAt: now }, now);
}

export function startSession(id: string, now: number = Date.now()): Session | undefined {
  return sessionsRepo.update(id, { status: 'active', startedAt: now }, now);
}

export function finishSession(id: string, now: number = Date.now()): Session | undefined {
  return sessionsRepo.update(id, { status: 'done', endedAt: now }, now);
}

export function useSessionsForDate(date: string): Session[] {
  return sessionsRepo.useLive(eq(sessions.date, date), asc(sessions.createdAt), [date]).data;
}

export function useSessionExercises(sessionId: string): SessionExercise[] {
  return sessionExercisesRepo.useLive(
    eq(sessionExercises.sessionId, sessionId),
    asc(sessionExercises.position),
    [sessionId],
  ).data;
}

export function useSets(sessionExerciseId: string): WorkoutSet[] {
  return setsRepo.useLive(eq(sets.sessionExerciseId, sessionExerciseId), asc(sets.idx), [sessionExerciseId])
    .data;
}
