/** Local calendar helpers for the Eat screens (engine date maths underneath; DST-safe). */
import { addDays, localDateFromEpoch, startOfWeek, weekDates, type ISODate } from '@repwise/engine';

/** Today's local date on this device. */
export function todayISO(now: number = Date.now()): ISODate {
  return localDateFromEpoch(now, -new Date(now).getTimezoneOffset());
}

export { addDays, startOfWeek, weekDates };

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(date: ISODate): number {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}

export function shortWeekday(date: ISODate): string {
  return DAY_SHORT[weekdayIndex(date)] ?? '';
}

export function dayOfMonth(date: ISODate): number {
  return Number(date.slice(8, 10));
}

/** "Today", "Tomorrow", "Yesterday" or "Thu 19 Nov". */
export function dayLabel(date: ISODate, today: ISODate): string {
  if (date === today) return 'Today';
  if (date === addDays(today, 1)) return 'Tomorrow';
  if (date === addDays(today, -1)) return 'Yesterday';
  return `${shortWeekday(date)} ${dayOfMonth(date)} ${MONTHS[Number(date.slice(5, 7)) - 1] ?? ''}`;
}

/** "16 Nov" for week headings. */
export function shortDate(date: ISODate): string {
  return `${dayOfMonth(date)} ${MONTHS[Number(date.slice(5, 7)) - 1] ?? ''}`;
}

export const isISODate = (s: unknown): s is ISODate =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
