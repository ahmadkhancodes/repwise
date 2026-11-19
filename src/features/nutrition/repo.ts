import { asc, desc, eq } from 'drizzle-orm';

import { createRepo, type Row } from '@/db/repo';
import { foodLogs } from '@/db/schema';

export const foodLogsRepo = createRepo(foodLogs, 'food_logs');
export type FoodLog = Row<typeof foodLogs>;
export type DayTotals = { kcal: number; p: number; c: number; f: number };

/** Pure: sum a day's logs (grams to 0.1). */
export function sumLogs(rows: Pick<FoodLog, 'kcal' | 'p' | 'c' | 'f'>[]): DayTotals {
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const t = rows.reduce<DayTotals>(
    (acc, r) => ({
      kcal: acc.kcal + (r.kcal ?? 0),
      p: acc.p + (r.p ?? 0),
      c: acc.c + (r.c ?? 0),
      f: acc.f + (r.f ?? 0),
    }),
    { kcal: 0, p: 0, c: 0, f: 0 },
  );
  return { kcal: Math.round(t.kcal), p: r1(t.p), c: r1(t.c), f: r1(t.f) };
}

export function logsForDate(date: string): FoodLog[] {
  return foodLogsRepo.list(eq(foodLogs.date, date), asc(foodLogs.createdAt));
}

export function useFoodLogs(date: string): FoodLog[] {
  return foodLogsRepo.useLive(eq(foodLogs.date, date), asc(foodLogs.createdAt), [date]).data;
}

export type NewFoodLog = {
  date: string;
  source: 'plan' | 'search' | 'quick';
  name: string;
  slot?: string | null;
  kcal: number;
  p?: number | null;
  c?: number | null;
  f?: number | null;
};

/** Add one log row (S23/S26). */
export function logFood(v: NewFoodLog, now: number = Date.now()): FoodLog {
  return foodLogsRepo.insert(
    {
      date: v.date,
      source: v.source,
      name: v.name,
      slot: v.slot ?? null,
      kcal: Math.round(v.kcal),
      p: v.p ?? null,
      c: v.c ?? null,
      f: v.f ?? null,
    },
    now,
  );
}

export function removeLog(id: string, now: number = Date.now()): boolean {
  return foodLogsRepo.remove(id, now);
}

/** Latest food-search logs (recent foods on S23). */
export function useRecentSearchLogs(limit = 60): FoodLog[] {
  return foodLogsRepo.useLive(eq(foodLogs.source, 'search'), desc(foodLogs.createdAt), [limit]).data.slice(0, limit);
}
