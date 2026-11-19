/**
 * History (S36): every finished workout and every day with food logged, newest first, grouped
 * by date for a SectionList.
 */
import type { ISODate } from './engine';
import {
  doneSessions,
  sessionDate,
  sessionMinutes,
  tonnage,
  type LoggedSet,
  type SessionLike,
} from './workouts';

export type HistoryItem =
  | {
      kind: 'workout';
      key: string;
      date: ISODate;
      sessionId: string;
      title: string;
      minutes: number;
      volumeKg: number;
      sets: number;
    }
  | { kind: 'food'; key: string; date: ISODate; entries: number; kcal: number };

export type HistorySection = { date: ISODate; data: HistoryItem[] };

export function historySections(
  sessions: readonly (SessionLike & { id: string })[],
  sets: readonly LoggedSet[],
  logs: readonly { date: string; kcal: number | null }[],
): HistorySection[] {
  const setsBySession = new Map<string, LoggedSet[]>();
  for (const s of sets)
    setsBySession.set(s.sessionId, [...(setsBySession.get(s.sessionId) ?? []), s]);
  const items: HistoryItem[] = [];
  for (const s of doneSessions(sessions)) {
    const date = sessionDate(s);
    if (!date) continue;
    const own = setsBySession.get(s.id) ?? [];
    items.push({
      kind: 'workout',
      key: `w-${s.id}`,
      date,
      sessionId: s.id,
      title: s.title?.trim() || 'Workout',
      minutes: sessionMinutes(s),
      volumeKg: Math.round(tonnage(own)),
      sets: own.filter((x) => x.type !== 'warmup').length,
    });
  }
  const food = new Map<string, { entries: number; kcal: number }>();
  for (const l of logs) {
    const f = food.get(l.date) ?? { entries: 0, kcal: 0 };
    f.entries += 1;
    f.kcal += l.kcal ?? 0;
    food.set(l.date, f);
  }
  for (const [date, f] of food)
    items.push({
      kind: 'food',
      key: `f-${date}`,
      date,
      entries: f.entries,
      kcal: Math.round(f.kcal),
    });

  const byDate = new Map<string, HistoryItem[]>();
  for (const it of items) byDate.set(it.date, [...(byDate.get(it.date) ?? []), it]);
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, data]) => ({
      date,
      data: data.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'workout' ? -1 : 1)),
    }));
}
