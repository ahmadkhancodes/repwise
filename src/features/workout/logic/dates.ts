import { localDateFromEpoch, startOfWeek, weekDates, weekdayMon0 } from './engine';

/** The user's local calendar date ('YYYY-MM-DD') at `ms`, DST-safe via the engine. */
export function localDate(ms: number = Date.now()): string {
  return localDateFromEpoch(ms, -new Date(ms).getTimezoneOffset());
}

/** Monday → Sunday of the week containing `date`. */
export function weekOf(date: string): string[] {
  return weekDates(startOfWeek(date));
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const WEEKDAYS_LONG = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function shortWeekday(date: string): string {
  return WEEKDAYS[weekdayMon0(date)] ?? '';
}

export function longWeekday(date: string): string {
  return WEEKDAYS_LONG[weekdayMon0(date)] ?? '';
}

export function dayOfMonth(date: string): number {
  return Number(date.slice(8, 10));
}

/** "Thu 19 Nov" */
export function shortDate(date: string): string {
  const month = MONTHS[Number(date.slice(5, 7)) - 1] ?? '';
  return `${shortWeekday(date)} ${dayOfMonth(date)} ${month}`;
}

/** "13:10" in the device's local time. */
export function clockTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
