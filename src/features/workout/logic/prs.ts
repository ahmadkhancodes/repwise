import { epley1RM } from './engine';
import { countsAsWork, isDone, type SetLike } from './sets';

export type PRKind = 'weight' | 'e1rm';
export type PR = { kind: PRKind; weightKg: number; reps: number; e1rm: number };
export type Best = { weightKg: number; e1rm: number } | null;

function e1rmOf(s: SetLike): number {
  const reps = s.reps ?? 0;
  const w = s.weightKg ?? 0;
  return reps >= 1 && w > 0 ? epley1RM(w, Math.round(reps)) : 0;
}

/** Best weight and best estimated 1RM (Epley, engine) over done work sets. Null if none. */
export function bestOf(sets: SetLike[]): Best {
  let weightKg = 0;
  let e1rm = 0;
  for (const s of sets) {
    if (!isDone(s) || !countsAsWork(s) || !(s.weightKg && s.weightKg > 0) || !(s.reps && s.reps > 0)) continue;
    weightKg = Math.max(weightKg, s.weightKg);
    e1rm = Math.max(e1rm, e1rmOf(s));
  }
  return weightKg > 0 ? { weightKg, e1rm } : null;
}

/**
 * Is this set a new personal record against everything logged before it (RW-22)?
 * Heaviest weight wins over a higher e1RM. No PR on the very first time an exercise is logged
 * (there is nothing to beat), on warm-ups, or on bodyweight/cardio sets.
 */
export function detectPR(set: SetLike, before: Best): PR | null {
  if (!before || !countsAsWork(set) || !(set.weightKg && set.weightKg > 0) || !(set.reps && set.reps > 0)) {
    return null;
  }
  const e1rm = e1rmOf(set);
  const base = { weightKg: set.weightKg, reps: set.reps, e1rm };
  if (set.weightKg > before.weightKg + 1e-9) return { kind: 'weight', ...base };
  if (e1rm > before.e1rm + 1e-6) return { kind: 'e1rm', ...base };
  return null;
}

/** The single best PR an exercise reached this session (sets in logging order), or null. */
export function sessionPR(sessionSets: SetLike[], history: SetLike[]): PR | null {
  let best = bestOf(history);
  if (!best) return null;
  let top: PR | null = null;
  const ordered = [...sessionSets].filter(isDone).sort((a, b) => (a.doneAt ?? 0) - (b.doneAt ?? 0));
  for (const s of ordered) {
    const pr = detectPR(s, best);
    if (pr) {
      if (!top || pr.weightKg > top.weightKg || (pr.weightKg === top.weightKg && pr.e1rm > top.e1rm)) top = pr;
      best = { weightKg: Math.max(best.weightKg, pr.weightKg), e1rm: Math.max(best.e1rm, pr.e1rm) };
    }
  }
  return top;
}
