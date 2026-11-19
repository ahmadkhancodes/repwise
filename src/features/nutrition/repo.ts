import { asc, eq } from 'drizzle-orm';

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
