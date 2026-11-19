import type { WeightUnit } from './engine';
import { activeMs } from './duration';
import { nextTimeFor, type NextTime } from './nextTime';
import { sessionPR, type PR } from './prs';
import { countsAsWork, isDone, volumeKg, type SetLike } from './sets';

export type SummaryItem = {
  name: string;
  pattern: string | undefined;
  equipment: readonly string[];
  targetReps: string | null | undefined;
  cardio: boolean;
  sets: SetLike[];
  /** Earlier done sets of this exercise (other sessions). */
  history: SetLike[];
};

export type WorkoutSummary = {
  durationMs: number;
  volumeKg: number;
  setsDone: number;
  exercisesDone: number;
  prs: { name: string; pr: PR }[];
  next: { name: string; next: NextTime }[];
};

/** Everything S35 shows, from the finished session's rows (PRs + next time come from the engine). */
export function buildSummary(
  session: { startedAt: number | null; endedAt: number | null; pausedMs: number | null },
  items: SummaryItem[],
  unit: WeightUnit,
  now: number = Date.now(),
): WorkoutSummary {
  const all = items.flatMap((i) => i.sets);
  const prs: WorkoutSummary['prs'] = [];
  const next: WorkoutSummary['next'] = [];
  for (const it of items) {
    if (it.cardio) continue;
    const pr = sessionPR(it.sets, it.history);
    if (pr) prs.push({ name: it.name, pr });
    const n = nextTimeFor({ sets: it.sets, targetReps: it.targetReps, pattern: it.pattern, equipment: it.equipment, unit });
    if (n) next.push({ name: it.name, next: n });
  }
  return {
    durationMs: activeMs(session, now),
    volumeKg: Math.round(volumeKg(all)),
    setsDone: all.filter((s) => isDone(s) && (countsAsWork(s) || s.type === 'cardio')).length,
    exercisesDone: items.filter((i) => i.sets.some(isDone)).length,
    prs,
    next,
  };
}

/** Share text for a finished workout (RW-52, text only; no health values beyond the lifts). */
export function shareText(
  title: string,
  s: WorkoutSummary,
  unit: WeightUnit,
  fmt: { duration: string; volume: string },
): string {
  const lines = [`${title} · ${fmt.duration}`, `${fmt.volume} ${unit} lifted · ${s.setsDone} sets`];
  for (const p of s.prs) lines.push(`New PR: ${p.name}`);
  lines.push('Logged with Repwise');
  return lines.join('\n');
}
