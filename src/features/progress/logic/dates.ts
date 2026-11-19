/**
 * Local calendar helpers for progress screens. Dates are LOCAL 'YYYY-MM-DD' strings (the same
 * keys the planner uses); arithmetic goes through the engine's day numbers so DST never makes a
 * 23/25-hour day. Callers always pass `now` (pure, testable).
 */
import { addDays, startOfWeek, type ISODate } from './engine';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date of an epoch-ms instant. */
export function localISODate(ms: number): ISODate {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight (epoch ms) at the start of a local date. */
export function startOfLocalDay(date: ISODate): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).getTime();
}

export type MonthKey = { year: number; month: number }; // month 1..12

export function monthOf(date: ISODate): MonthKey {
  const [y, m] = date.split('-').map(Number) as [number, number];
  return { year: y, month: m };
}

export function shiftMonth({ year, month }: MonthKey, delta: number): MonthKey {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function firstOfMonth({ year, month }: MonthKey): ISODate {
  return `${year}-${pad(month)}-01`;
}

export function daysInMonth({ year, month }: MonthKey): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Every date of the month, in order. */
export function monthDates(key: MonthKey): ISODate[] {
  const first = firstOfMonth(key);
  return Array.from({ length: daysInMonth(key) }, (_, i) => addDays(first, i));
}

export function inMonth(date: ISODate, key: MonthKey): boolean {
  return date.startsWith(`${key.year}-${pad(key.month)}-`);
}

export function sameMonth(a: MonthKey, b: MonthKey): boolean {
  return a.year === b.year && a.month === b.month;
}

/** Mondays of the last `count` weeks, oldest first, ending with the week of `today`. */
export function lastWeekStarts(today: ISODate, count: number): ISODate[] {
  const current = startOfWeek(today);
  return Array.from({ length: count }, (_, i) => addDays(current, -7 * (count - 1 - i)));
}

/** The last `count` dates ending with today, oldest first. */
export function lastDays(today: ISODate, count: number): ISODate[] {
  return Array.from({ length: count }, (_, i) => addDays(today, -(count - 1 - i)));
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function monthName(month: number): string {
  return MONTHS[(month - 1 + 12) % 12] ?? '';
}

export function shortMonth(month: number): string {
  return monthName(month).slice(0, 3);
}

/** "18 Nov" — short, locale-neutral, used for chart labels and list rows. */
export function shortDate(date: ISODate): string {
  const [, m, d] = date.split('-').map(Number) as [number, number, number];
  return `${d} ${shortMonth(m)}`;
}

/** "Tue 18 Nov". */
export function dayLabel(date: ISODate): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
    new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  ];
  return `${wd} ${d} ${shortMonth(m)}`;
}
