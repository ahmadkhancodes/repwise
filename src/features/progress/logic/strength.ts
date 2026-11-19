/**
 * Strength records per exercise (S31) and the PR list. 1RM estimates come from the engine
 * (Epley); this module only groups sets into sessions and keeps running bests.
 */
import { epley1RM, type ISODate } from './engine';
import { isWorkSet, type LoggedSet } from './workouts';

/** Above this rep count an e1RM estimate is too loose to chart (sets still count for volume). */
export const MAX_E1RM_REPS = 12;

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Engine Epley e1RM of one set, or null when the set can't give a fair estimate. */
export function setE1rm(s: Pick<LoggedSet, 'type' | 'weightKg' | 'reps'>): number | null {
  if (!isWorkSet(s) || s.weightKg <= 0 || s.reps < 1 || s.reps > MAX_E1RM_REPS) return null;
  return r1(epley1RM(s.weightKg, s.reps));
}

export type ExerciseSession = {
  sessionId: string;
  date: ISODate;
  doneAt: number;
  /** Best estimated 1RM in the session (null if no set qualifies). */
  e1rm: number | null;
  /** Heaviest work-set weight. */
  topWeightKg: number;
  /** Reps done at the heaviest weight (best of those sets). */
  topReps: number;
  /** Σ weight × reps of work sets. */
  volumeKg: number;
  sets: number;
};

/** One point per session for one exercise, oldest first. */
export function exerciseSessions(
  sets: readonly LoggedSet[],
  exerciseId: string,
): ExerciseSession[] {
  const bySession = new Map<string, ExerciseSession>();
  for (const s of sets) {
    if (s.exerciseId !== exerciseId || !isWorkSet(s)) continue;
    let row = bySession.get(s.sessionId);
    if (!row) {
      row = {
        sessionId: s.sessionId,
        date: s.date,
        doneAt: s.doneAt,
        e1rm: null,
        topWeightKg: 0,
        topReps: 0,
        volumeKg: 0,
        sets: 0,
      };
      bySession.set(s.sessionId, row);
    }
    row.doneAt = Math.min(row.doneAt, s.doneAt);
    row.sets += 1;
    row.volumeKg += s.weightKg * s.reps;
    const e = setE1rm(s);
    if (e != null && (row.e1rm == null || e > row.e1rm)) row.e1rm = e;
    if (s.weightKg > row.topWeightKg || (s.weightKg === row.topWeightKg && s.reps > row.topReps)) {
      row.topWeightKg = s.weightKg;
      row.topReps = s.reps;
    }
  }
  return [...bySession.values()]
    .map((r) => ({ ...r, volumeKg: r1(r.volumeKg) }))
    .sort((a, b) => a.doneAt - b.doneAt);
}

export type PRKind = 'weight' | 'e1rm';

export type PersonalRecord = {
  exerciseId: string;
  sessionId: string;
  date: ISODate;
  doneAt: number;
  kind: PRKind;
  /** New best (kg). For 'weight' this is the load, for 'e1rm' the estimate. */
  valueKg: number;
  /** Reps at that load (weight PRs). */
  reps: number;
  /** Previous best (kg) it beat. */
  previousKg: number;
};

/**
 * PRs: a session sets a record when its heaviest weight (or, failing that, its best e1RM) beats
 * every earlier session of that exercise. The first session is the baseline, never a PR.
 * Newest first.
 */
export function personalRecords(sets: readonly LoggedSet[]): PersonalRecord[] {
  const exerciseIds = [...new Set(sets.map((s) => s.exerciseId))];
  const out: PersonalRecord[] = [];
  for (const id of exerciseIds) {
    let bestWeight = 0;
    let bestE1rm = 0;
    let seen = false;
    for (const row of exerciseSessions(sets, id)) {
      if (row.topWeightKg <= 0) continue;
      if (seen) {
        if (row.topWeightKg > bestWeight) {
          out.push({
            exerciseId: id,
            sessionId: row.sessionId,
            date: row.date,
            doneAt: row.doneAt,
            kind: 'weight',
            valueKg: row.topWeightKg,
            reps: row.topReps,
            previousKg: bestWeight,
          });
        } else if (row.e1rm != null && row.e1rm > bestE1rm && bestE1rm > 0) {
          out.push({
            exerciseId: id,
            sessionId: row.sessionId,
            date: row.date,
            doneAt: row.doneAt,
            kind: 'e1rm',
            valueKg: row.e1rm,
            reps: row.topReps,
            previousKg: bestE1rm,
          });
        }
      }
      seen = true;
      bestWeight = Math.max(bestWeight, row.topWeightKg);
      if (row.e1rm != null) bestE1rm = Math.max(bestE1rm, row.e1rm);
    }
  }
  return out.sort((a, b) => b.doneAt - a.doneAt);
}

export type ExerciseSummary = {
  exerciseId: string;
  sessions: number;
  lastDate: ISODate;
  lastDoneAt: number;
  bestE1rm: number | null;
  /** Change in best e1RM: last session vs the first session in the list (kg), or null. */
  e1rmChange: number | null;
};

/** Trained exercises, most recent first (S31 index). */
export function trainedExercises(sets: readonly LoggedSet[]): ExerciseSummary[] {
  const ids = [...new Set(sets.filter(isWorkSet).map((s) => s.exerciseId))];
  return ids
    .map((id) => {
      const rows = exerciseSessions(sets, id);
      const last = rows[rows.length - 1]!;
      const withE = rows.filter((r) => r.e1rm != null);
      const best = withE.length ? Math.max(...withE.map((r) => r.e1rm as number)) : null;
      const first = withE[0]?.e1rm ?? null;
      const latest = withE[withE.length - 1]?.e1rm ?? null;
      return {
        exerciseId: id,
        sessions: rows.length,
        lastDate: last.date,
        lastDoneAt: last.doneAt,
        bestE1rm: best,
        e1rmChange:
          withE.length >= 2 && first != null && latest != null ? r1(latest - first) : null,
      };
    })
    .sort((a, b) => b.lastDoneAt - a.lastDoneAt);
}
