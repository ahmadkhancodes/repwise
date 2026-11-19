/**
 * History and personal records for one exercise (S19 "records"), from logged sets.
 * The 1RM estimate and kg→lb come from the engine (maths is never re-implemented in the UI).
 */
import { epley1RM, kgToLb } from '@repwise/engine';

export type LoggedSet = {
  sessionId: string;
  /** Session date (YYYY-MM-DD) if known, else derived from doneAt. */
  date: string | null;
  type: string;
  weightKg: number | null;
  reps: number | null;
  doneAt: number | null;
};

export type SetRecord = { weightKg: number; reps: number; date: string };

export type ExerciseRecords = {
  /** Best estimated 1RM (Epley), kg. */
  e1rm: { value: number; date: string } | null;
  heaviest: SetRecord | null;
  mostReps: SetRecord | null;
  /** Heaviest single-session volume (Σ weight × reps), kg. */
  sessionVolume: { value: number; date: string } | null;
};

export type SessionSummary = {
  sessionId: string;
  date: string;
  sets: number;
  volume: number;
  top: { weightKg: number; reps: number } | null;
};

/** Reps beyond this make 1RM estimates meaningless (engine caps at 30 too). */
const E1RM_MAX_REPS = 30;

function dateOf(s: LoggedSet): string {
  if (s.date) return s.date;
  return new Date(s.doneAt ?? 0).toISOString().slice(0, 10);
}

/** Done, non-warm-up sets with a valid rep count. */
export function countable(sets: readonly LoggedSet[]): LoggedSet[] {
  return sets.filter(
    (s) => s.doneAt != null && s.type !== 'warmup' && s.reps != null && s.reps >= 1,
  );
}

export function computeRecords(all: readonly LoggedSet[]): ExerciseRecords {
  const sets = countable(all);
  let e1rm: ExerciseRecords['e1rm'] = null;
  let heaviest: SetRecord | null = null;
  let mostReps: SetRecord | null = null;
  for (const s of sets) {
    const reps = s.reps as number;
    const w = s.weightKg ?? 0;
    const date = dateOf(s);
    if (w > 0) {
      const est = epley1RM(w, Math.min(Math.round(reps), E1RM_MAX_REPS));
      if (!e1rm || est > e1rm.value) e1rm = { value: est, date };
      if (!heaviest || w > heaviest.weightKg || (w === heaviest.weightKg && reps > heaviest.reps)) {
        heaviest = { weightKg: w, reps, date };
      }
    }
    if (!mostReps || reps > mostReps.reps || (reps === mostReps.reps && w > mostReps.weightKg)) {
      mostReps = { weightKg: w, reps, date };
    }
  }
  const best = summariseSessions(all).reduce<SessionSummary | null>(
    (b, s) => (s.volume > 0 && (!b || s.volume > b.volume) ? s : b),
    null,
  );
  return {
    e1rm,
    heaviest,
    mostReps,
    sessionVolume: best ? { value: best.volume, date: best.date } : null,
  };
}

/** Newest session first. */
export function summariseSessions(all: readonly LoggedSet[], limit = Infinity): SessionSummary[] {
  const by = new Map<string, { s: SessionSummary; last: number }>();
  for (const set of countable(all)) {
    const reps = set.reps as number;
    const w = set.weightKg ?? 0;
    let e = by.get(set.sessionId);
    if (!e) {
      e = {
        s: { sessionId: set.sessionId, date: dateOf(set), sets: 0, volume: 0, top: null },
        last: 0,
      };
      by.set(set.sessionId, e);
    }
    e.s.sets += 1;
    e.s.volume += w * reps;
    e.last = Math.max(e.last, set.doneAt ?? 0);
    const top = e.s.top;
    if (!top || w > top.weightKg || (w === top.weightKg && reps > top.reps)) {
      e.s.top = { weightKg: w, reps };
    }
  }
  return [...by.values()]
    .sort((a, b) => b.s.date.localeCompare(a.s.date) || b.last - a.last)
    .slice(0, limit)
    .map((e) => e.s);
}

export type Units = 'kg' | 'lb';

export function unitsOf(v: string | null | undefined): Units {
  return v === 'lb' || v === 'imperial' ? 'lb' : 'kg';
}

/** Display a kg value in the user's unit, 1 decimal max ("102.5", "80"). */
export function formatWeight(kg: number, units: Units): string {
  const v = units === 'lb' ? kgToLb(kg) : kg;
  return String(Math.round(v * 10) / 10);
}

/** Volume shown as a whole number in the user's unit. */
export function displayVolume(kg: number, units: Units): number {
  return Math.round(units === 'lb' ? kgToLb(kg) : kg);
}
