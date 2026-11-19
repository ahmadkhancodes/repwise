import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { createRepo, type NewRow, type Row } from '@/db/repo';
import { sessionExercises, sessions, sets, type SetType } from '@/db/schema';

import { prefillSets, type Prefill } from './logic/sets';

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

// ---------------------------------------------------------------------------
// Workout player (P8): every write is local SQLite and synchronous (< 100 ms, offline).
// ---------------------------------------------------------------------------

export function getSession(id: string): Session | undefined {
  return sessionsRepo.get(id);
}

/** The workout in progress (crash-safe resume): newest active or paused session. */
export function activeSession(): Session | undefined {
  return sessionsRepo.first(
    or(eq(sessions.status, 'active'), eq(sessions.status, 'paused')),
    desc(sessions.startedAt),
  );
}

export function sessionsBetween(from: string, to: string): Session[] {
  return sessionsRepo
    .list(undefined, asc(sessions.date))
    .filter((s) => s.date != null && s.date >= from && s.date <= to);
}

/** Finished workouts, newest first (Train → History). */
export function doneSessions(limit = 100): Session[] {
  return getDb()
    .select()
    .from(sessions)
    .where(and(isNull(sessions.deletedAt), eq(sessions.status, 'done')))
    .orderBy(desc(sessions.endedAt))
    .limit(limit)
    .all();
}

/** All sets of a session (one query), keyed by session exercise id, in set order. */
export function setsForSession(sessionId: string): Map<string, WorkoutSet[]> {
  const ids = exercisesForSession(sessionId).map((e) => e.id);
  const out = new Map<string, WorkoutSet[]>(ids.map((id) => [id, []]));
  if (ids.length === 0) return out;
  const rows = setsRepo.list(inArray(sets.sessionExerciseId, ids), asc(sets.idx));
  for (const r of rows) out.get(r.sessionExerciseId)?.push(r);
  return out;
}

type HistoryRow = { set: WorkoutSet; sessionId: string; endedAt: number | null; date: string | null };

/** Done sets of `exerciseId` from finished sessions other than `excludeSessionId`, newest session first. */
function historyRows(exerciseId: string, excludeSessionId: string | null): HistoryRow[] {
  const where = [
    eq(sessionExercises.exerciseId, exerciseId),
    eq(sessions.status, 'done'),
    isNull(sets.deletedAt),
    isNull(sessionExercises.deletedAt),
    isNull(sessions.deletedAt),
    isNotNull(sets.doneAt),
  ];
  if (excludeSessionId) where.push(ne(sessions.id, excludeSessionId));
  return getDb()
    .select({ set: sets, sessionId: sessions.id, endedAt: sessions.endedAt, date: sessions.date })
    .from(sets)
    .innerJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
    .innerJoin(sessions, eq(sessionExercises.sessionId, sessions.id))
    .where(and(...where))
    .orderBy(desc(sessions.endedAt), asc(sets.idx))
    .all();
}

/** Last finished session's sets for an exercise (the ghosted "Previous" column, RW-22). */
export function previousSets(exerciseId: string, excludeSessionId: string | null): WorkoutSet[] {
  const rows = historyRows(exerciseId, excludeSessionId);
  const first = rows[0]?.sessionId;
  return rows.filter((r) => r.sessionId === first).map((r) => r.set);
}

/** Every earlier done set of an exercise (PR detection). */
export function exerciseHistory(exerciseId: string, excludeSessionId: string | null): WorkoutSet[] {
  return historyRows(exerciseId, excludeSessionId).map((r) => r.set);
}

/** Recent finished sessions as exercise-id lists (swap: "not used in the last 2 sessions"). */
export function recentSessionExercises(
  excludeSessionId: string,
  limit = 4,
): { date: string; exerciseIds: string[] }[] {
  return doneSessions(limit)
    .filter((s) => s.id !== excludeSessionId && s.date)
    .reverse()
    .map((s) => ({ date: s.date as string, exerciseIds: exercisesForSession(s.id).map((e) => e.exerciseId) }));
}

function insertPrefilled(seId: string, rows: Prefill[], startIdx: number, now: number): void {
  rows.forEach((p, i) =>
    setsRepo.insert(
      { sessionExerciseId: seId, idx: startIdx + i, type: p.type, weightKg: p.weightKg, reps: p.reps },
      now,
    ),
  );
}

/** Create the pre-filled (not yet done) set rows for one exercise, if it has none. */
export function ensurePlannedSets(
  se: SessionExercise,
  opts: { cardio?: boolean } = {},
  now: number = Date.now(),
): void {
  if (setsFor(se.id).length > 0) return;
  const rows = prefillSets({
    targetSets: se.targetSets,
    targetReps: se.targetReps,
    targetLoad: se.targetLoad,
    previous: previousSets(se.exerciseId, se.sessionId),
    cardio: opts.cardio,
  });
  insertPrefilled(se.id, rows, 0, now);
}

/**
 * Start (or resume after a crash) a workout: status active, start time kept if already set,
 * and every exercise gets its pre-filled set rows so each edit is saved the moment it happens.
 */
export function startWorkout(
  sessionId: string,
  isCardio: (exerciseId: string) => boolean = () => false,
  now: number = Date.now(),
): Session | undefined {
  const s = getSession(sessionId);
  if (!s) return undefined;
  for (const se of exercisesForSession(sessionId)) {
    ensurePlannedSets(se, { cardio: isCardio(se.exerciseId) }, now);
  }
  if (s.status === 'active') return s;
  return sessionsRepo.update(sessionId, { status: 'active', startedAt: s.startedAt ?? now }, now);
}

export function pauseWorkout(sessionId: string, now: number = Date.now()): Session | undefined {
  return sessionsRepo.update(sessionId, { status: 'paused' }, now);
}

/** Resume: the paused span (tracked by the caller) is added to paused_ms so it never counts. */
export function resumeWorkout(sessionId: string, pausedForMs: number, now: number = Date.now()): Session | undefined {
  const s = getSession(sessionId);
  if (!s) return undefined;
  return sessionsRepo.update(
    sessionId,
    { status: 'active', pausedMs: (s.pausedMs ?? 0) + Math.max(0, pausedForMs) },
    now,
  );
}

/** Finish: done + end time; sets never ticked are removed so history only holds real work. */
export function finishWorkout(sessionId: string, now: number = Date.now()): Session | undefined {
  for (const list of setsForSession(sessionId).values()) {
    for (const s of list) if (s.doneAt == null) setsRepo.remove(s.id, now);
  }
  return sessionsRepo.update(sessionId, { status: 'done', endedAt: now }, now);
}

/** Discard: a planned session goes back to planned (sets cleared); an ad-hoc one is deleted. */
export function discardWorkout(sessionId: string, now: number = Date.now()): void {
  const s = getSession(sessionId);
  if (!s) return;
  for (const list of setsForSession(sessionId).values()) for (const st of list) setsRepo.remove(st.id, now);
  if (s.planId) {
    sessionsRepo.update(sessionId, { status: 'planned', startedAt: null, endedAt: null, pausedMs: null }, now);
    return;
  }
  for (const se of exercisesForSession(sessionId)) sessionExercisesRepo.remove(se.id, now);
  sessionsRepo.remove(sessionId, now);
}

export type NewExercise = {
  exerciseId: string;
  targetSets?: number | null;
  targetReps?: string | null;
  targetLoad?: number | null;
  restS?: number | null;
};

/** A new ad-hoc session for `date` (empty workout, or from a routine). */
export function createSession(
  values: { date: string; title: string; exercises?: NewExercise[] },
  now: number = Date.now(),
): Session {
  const s = sessionsRepo.insert({ date: values.date, title: values.title, status: 'planned' }, now);
  (values.exercises ?? []).forEach((e, i) =>
    sessionExercisesRepo.insert({ sessionId: s.id, position: i, ...e }, now),
  );
  return s;
}

/** Add an exercise at the end; if the workout is running its set rows are created at once. */
export function addExercise(
  sessionId: string,
  e: NewExercise,
  opts: { cardio?: boolean } = {},
  now: number = Date.now(),
): SessionExercise {
  const position = exercisesForSession(sessionId).reduce((m, x) => Math.max(m, x.position + 1), 0);
  const se = sessionExercisesRepo.insert(
    { sessionId, position, targetSets: e.targetSets ?? 3, targetReps: e.targetReps ?? '8-12', targetLoad: e.targetLoad ?? null, restS: e.restS ?? 90, exerciseId: e.exerciseId },
    now,
  );
  const s = getSession(sessionId);
  if (s?.status === 'active' || s?.status === 'paused') ensurePlannedSets(se, opts, now);
  return se;
}

export function removeExercise(seId: string, now: number = Date.now()): void {
  for (const s of setsFor(seId)) setsRepo.remove(s.id, now);
  sessionExercisesRepo.remove(seId, now);
}

/** Swap (S15): replace the exercise; its not-done sets are re-filled from the new one's history. */
export function swapExerciseRow(
  seId: string,
  newExerciseId: string,
  opts: { cardio?: boolean } = {},
  now: number = Date.now(),
): SessionExercise | undefined {
  const se = sessionExercisesRepo.get(seId);
  if (!se) return undefined;
  const existing = setsFor(seId);
  const hadSets = existing.length > 0;
  for (const s of existing) if (s.doneAt == null) setsRepo.remove(s.id, now);
  const updated = sessionExercisesRepo.update(
    seId,
    { exerciseId: newExerciseId, targetLoad: null, notes: null },
    now,
  );
  if (updated && hadSets && setsFor(seId).length === 0) ensurePlannedSets(updated, opts, now);
  return updated;
}

/** Reorder (RW-26): write positions 0..n-1 in the given order (only rows that move). */
export function reorderExercises(sessionId: string, orderedIds: string[], now: number = Date.now()): void {
  const current = new Map(exercisesForSession(sessionId).map((e) => [e.id, e.position]));
  orderedIds.forEach((id, position) => {
    if (current.has(id) && current.get(id) !== position) sessionExercisesRepo.update(id, { position }, now);
  });
}

export function setExerciseNotes(seId: string, notes: string, now: number = Date.now()): void {
  sessionExercisesRepo.update(seId, { notes: notes.trim() ? notes : null }, now);
}

export type SetPatch = {
  type?: SetType;
  weightKg?: number | null;
  reps?: number | null;
  rpe?: number | null;
  durationS?: number | null;
  distanceM?: number | null;
};

export function updateSet(id: string, patch: SetPatch, now: number = Date.now()): WorkoutSet | undefined {
  return setsRepo.update(id, patch, now);
}

/** The 1-tap log: mark done (with the values shown) or undo. */
export function setDone(id: string, done: boolean, patch: SetPatch = {}, now: number = Date.now()): WorkoutSet | undefined {
  return setsRepo.update(id, { ...patch, doneAt: done ? now : null }, now);
}

/** Add a set after the last one, copying its type and values (the usual "one more"). */
export function addSet(seId: string, now: number = Date.now()): WorkoutSet {
  const list = setsFor(seId);
  const last = list[list.length - 1];
  return setsRepo.insert(
    {
      sessionExerciseId: seId,
      idx: (last?.idx ?? -1) + 1,
      type: last?.type === 'warmup' ? 'working' : (last?.type ?? 'working'),
      weightKg: last?.weightKg ?? null,
      reps: last?.reps ?? null,
      durationS: last?.durationS ?? null,
      distanceM: last?.distanceM ?? null,
    },
    now,
  );
}

export function removeSet(id: string, now: number = Date.now()): void {
  setsRepo.remove(id, now);
}
