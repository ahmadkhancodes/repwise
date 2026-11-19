import type { SessionStatus } from '@/db/schema';

export type SessionLike = { id: string; status: SessionStatus | null; title: string | null };
export type PlannedExercise = {
  exerciseId: string;
  targetSets: number | null;
  restS: number | null;
};

const STATUS_RANK: Record<SessionStatus, number> = {
  active: 0,
  paused: 1,
  planned: 2,
  done: 3,
  skipped: 9,
};

/** The session Today shows: one in progress first, then the planned one, then a finished one. */
export function pickTodaySession<T extends SessionLike>(sessions: T[]): T | undefined {
  return [...sessions]
    .filter((s) => (s.status ?? 'planned') !== 'skipped')
    .sort((a, b) => STATUS_RANK[a.status ?? 'planned'] - STATUS_RANK[b.status ?? 'planned'])[0];
}

/** Seconds of work per set used for time estimates (a set of 8–12 reps plus setup). */
export const WORK_S_PER_SET = 40;
const DEFAULT_SETS = 3;
const DEFAULT_REST_S = 90;
/** Warm-up and moving between stations. */
const OVERHEAD_MIN = 5;

/** Estimated session length in minutes, rounded to 5 (sets × (work + rest) + overhead). */
export function estimateMinutes(items: PlannedExercise[]): number {
  if (items.length === 0) return 0;
  const seconds = items.reduce((sum, it) => {
    const sets = it.targetSets && it.targetSets > 0 ? it.targetSets : DEFAULT_SETS;
    const rest = it.restS != null && it.restS >= 0 ? it.restS : DEFAULT_REST_S;
    return sum + sets * WORK_S_PER_SET + Math.max(0, sets - 1) * rest;
  }, 0);
  const minutes = seconds / 60 + OVERHEAD_MIN;
  return Math.max(5, Math.round(minutes / 5) * 5);
}

export function totalSets(items: PlannedExercise[]): number {
  return items.reduce((s, it) => s + (it.targetSets && it.targetSets > 0 ? it.targetSets : DEFAULT_SETS), 0);
}

/** Most-worked muscles across the session (primary muscles, by count), title-cased, max `limit`. */
export function topMuscles(muscleLists: string[][], limit = 3): string[] {
  const count = new Map<string, number>();
  muscleLists.forEach((list) => list.forEach((m) => count.set(m, (count.get(m) ?? 0) + 1)));
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([m]) => humanize(m));
}

/** "rear_delts" → "Rear delts". */
export function humanize(id: string): string {
  const s = id.replace(/[_-]+/g, ' ').trim();
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/** "Push day · 52 min · 6 exercises" (W2). */
export function workoutMeta(minutes: number, exercises: number): string {
  const parts: string[] = [];
  if (minutes > 0) parts.push(`${minutes} min`);
  parts.push(`${exercises} ${exercises === 1 ? 'exercise' : 'exercises'}`);
  return parts.join(' · ');
}
