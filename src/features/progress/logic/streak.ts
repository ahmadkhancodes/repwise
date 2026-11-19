/**
 * Streaks and the activity calendar (S29). A week counts when at least one workout was finished
 * in it (Mon–Sun). The current week never breaks a streak while it is still running.
 */
import { addDays, startOfWeek, weekdayMon0, type ISODate } from './engine';
import { monthDates, type MonthKey } from './dates';

export type Streak = { current: number; longest: number; thisWeekDone: boolean };

export function weekStreak(workoutDates: readonly string[], today: ISODate): Streak {
  const weeks = new Set(workoutDates.filter((d) => d <= today).map((d) => startOfWeek(d)));
  const thisWeek = startOfWeek(today);
  const thisWeekDone = weeks.has(thisWeek);
  let current = 0;
  let w = thisWeekDone ? thisWeek : addDays(thisWeek, -7);
  while (weeks.has(w)) {
    current += 1;
    w = addDays(w, -7);
  }
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const wk of [...weeks].sort()) {
    run = prev != null && addDays(prev, 7) === wk ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = wk;
  }
  return { current, longest: Math.max(longest, current), thisWeekDone };
}

export type CalendarDay = {
  date: ISODate;
  day: number;
  workout: boolean;
  logged: boolean;
  isToday: boolean;
  isFuture: boolean;
};

/** Month grid, Monday first: leading nulls pad the first week, trailing nulls fill the last row. */
export function monthCalendar(
  key: MonthKey,
  workoutDates: ReadonlySet<string>,
  loggedDates: ReadonlySet<string>,
  today: ISODate,
): (CalendarDay | null)[][] {
  const dates = monthDates(key);
  const lead = weekdayMon0(dates[0]!);
  const cells: (CalendarDay | null)[] = Array.from({ length: lead }, () => null);
  for (const date of dates) {
    cells.push({
      date,
      day: Number(date.slice(8)),
      workout: workoutDates.has(date),
      logged: loggedDates.has(date),
      isToday: date === today,
      isFuture: date > today,
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (CalendarDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

/** Workouts finished in the week of `today`. */
export function workoutsThisWeek(workoutDates: readonly string[], today: ISODate): number {
  const monday = startOfWeek(today);
  return workoutDates.filter((d) => d >= monday && d <= today).length;
}
