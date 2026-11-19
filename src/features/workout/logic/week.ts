import type { SessionStatus } from '@/db/schema';

export type DayState = 'done' | 'active' | 'planned' | 'missed' | 'rest';

export type WeekSession = { id: string; date: string | null; status: SessionStatus | null };

/** One cell of the week strip (S08): the strongest state among that day's sessions. */
export function dayState(sessions: WeekSession[], date: string, today: string): DayState {
  const mine = sessions.filter((s) => s.date === date && s.status !== 'skipped');
  if (mine.length === 0) return 'rest';
  if (mine.some((s) => s.status === 'active' || s.status === 'paused')) return 'active';
  if (mine.some((s) => s.status === 'done')) return 'done';
  return date < today ? 'missed' : 'planned';
}

export function weekStates(
  sessions: WeekSession[],
  dates: string[],
  today: string,
): { date: string; state: DayState }[] {
  return dates.map((date) => ({ date, state: dayState(sessions, date, today) }));
}

/** "2 of 4 done" for the week header. */
export function weekCounts(sessions: WeekSession[]): { done: number; total: number } {
  const counted = sessions.filter((s) => s.status !== 'skipped');
  return { done: counted.filter((s) => s.status === 'done').length, total: counted.length };
}
