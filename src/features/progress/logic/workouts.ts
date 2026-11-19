/**
 * Joins the workout tables (sessions → session_exercises → sets) into flat, done sets that the
 * charts and the engine heatmap consume. Pure: takes plain rows, returns plain values.
 */
import type { ISODate } from './engine';
import { localISODate } from './dates';

export type SessionLike = {
  id: string;
  date: string | null;
  title: string | null;
  status: string | null;
  startedAt: number | null;
  endedAt: number | null;
  pausedMs: number | null;
};
export type SessionExerciseLike = {
  id: string;
  sessionId: string;
  exerciseId: string;
  position: number;
};
export type SetLike = {
  id: string;
  sessionExerciseId: string;
  idx: number;
  type: string;
  weightKg: number | null;
  reps: number | null;
  doneAt: number | null;
};

export type LoggedSet = {
  id: string;
  sessionId: string;
  exerciseId: string;
  /** Local calendar date of the session (falls back to the set's own day). */
  date: ISODate;
  doneAt: number;
  type: 'warmup' | 'working' | 'drop' | 'failure' | 'cardio';
  weightKg: number;
  reps: number;
};

const SET_TYPES = new Set(['warmup', 'working', 'drop', 'failure', 'cardio']);

/** Only ticked sets (done_at set) of non-deleted rows; ordered by done time. */
export function flattenSets(
  sessions: readonly SessionLike[],
  sessionExercises: readonly SessionExerciseLike[],
  sets: readonly SetLike[],
): LoggedSet[] {
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const seById = new Map(sessionExercises.map((se) => [se.id, se]));
  const out: LoggedSet[] = [];
  for (const s of sets) {
    if (s.doneAt == null) continue;
    const se = seById.get(s.sessionExerciseId);
    if (!se) continue;
    const session = sessionById.get(se.sessionId);
    if (!session || session.status === 'skipped') continue;
    out.push({
      id: s.id,
      sessionId: se.sessionId,
      exerciseId: se.exerciseId,
      date: session.date ?? localISODate(s.doneAt),
      doneAt: s.doneAt,
      type: (SET_TYPES.has(s.type) ? s.type : 'working') as LoggedSet['type'],
      weightKg: Math.max(0, s.weightKg ?? 0),
      reps: Math.max(0, Math.round(s.reps ?? 0)),
    });
  }
  return out.sort((a, b) => a.doneAt - b.doneAt || a.id.localeCompare(b.id));
}

/** Sets that count as hard work for volume and records (no warm-ups, no cardio). */
export function isWorkSet(s: Pick<LoggedSet, 'type'>): boolean {
  return s.type === 'working' || s.type === 'drop' || s.type === 'failure';
}

/** Tonnage: Σ weight × reps of work sets. */
export function tonnage(sets: readonly LoggedSet[]): number {
  return sets.reduce((acc, s) => (isWorkSet(s) ? acc + s.weightKg * s.reps : acc), 0);
}

/** Completed sessions only. */
export function doneSessions<T extends SessionLike>(sessions: readonly T[]): T[] {
  return sessions.filter((s) => s.status === 'done');
}

/** Active minutes of a finished session (ended − started − paused), never negative. */
export function sessionMinutes(s: SessionLike): number {
  if (s.startedAt == null || s.endedAt == null) return 0;
  return Math.max(0, Math.round((s.endedAt - s.startedAt - (s.pausedMs ?? 0)) / 60_000));
}

/** Date of a session (its plan date, else the day it ended/started). */
export function sessionDate(s: SessionLike): ISODate | null {
  if (s.date) return s.date;
  const at = s.endedAt ?? s.startedAt;
  return at == null ? null : localISODate(at);
}
