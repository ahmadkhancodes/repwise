/**
 * Success moments Today can spot (store review triggers, src/services/review.ts). Pure: Today
 * compares the previous and current day state and fires on a false → true transition only, so a
 * re-render or a reopen never asks twice.
 */
import { addDays, startOfWeek } from '@/features/meals/logic/dates';

export type DayMomentState = {
  /** Every planned training session of this week is done (and there was at least one). */
  weekComplete: boolean;
};

export type WeekTraining = { planned: number; done: number };

export function isWeekComplete(w: WeekTraining | null | undefined): boolean {
  return !!w && w.planned > 0 && w.done >= w.planned;
}

/** Week-streak lengths worth celebrating. */
export const STREAK_MILESTONES = [4, 8, 12, 26, 52] as const;

/** Consecutive weeks (Mon–Sun) with a finished workout, ending this week. Pure. */
export function currentWeekStreak(doneDates: readonly string[], today: string): number {
  const weeks = new Set(doneDates.filter((d) => d <= today).map((d) => startOfWeek(d)));
  let n = 0;
  let w = startOfWeek(today);
  while (weeks.has(w)) {
    n += 1;
    w = addDays(w, -7);
  }
  return n;
}

export type ReviewMoment = 'week_complete' | 'streak_milestone';

/**
 * The moment to celebrate when this week flips to complete: a streak milestone beats a plain
 * week. Returns null when nothing flipped.
 */
export function reviewMoment(
  prev: DayMomentState | null,
  next: DayMomentState,
  streakWeeks: () => number,
): ReviewMoment | null {
  if (!prev || prev.weekComplete || !next.weekComplete) return null;
  return (STREAK_MILESTONES as readonly number[]).includes(streakWeeks()) ? 'streak_milestone' : 'week_complete';
}
