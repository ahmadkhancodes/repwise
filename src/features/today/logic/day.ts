import { addDays, localDateFromEpoch, type ISODate } from './engine';

export type DayPhase = 'morning' | 'afternoon' | 'evening';

/** The user's local calendar date for an instant (device time zone unless an offset is given). */
export function localDate(now: number, utcOffsetMin = -new Date(now).getTimezoneOffset()): ISODate {
  return localDateFromEpoch(now, utcOffsetMin);
}

export function tomorrowOf(date: ISODate): ISODate {
  return addDays(date, 1);
}

/** Local hour 0–23 of an instant. */
export function localHour(now: number): number {
  return new Date(now).getHours();
}

/** Morning before 12:00, afternoon until 18:00, evening after (evening shows progress + tomorrow). */
export function dayPhase(hour: number): DayPhase {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

export function greeting(phase: DayPhase, name?: string | null): string {
  const base =
    phase === 'morning' ? 'Good morning' : phase === 'afternoon' ? 'Good afternoon' : 'Good evening';
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${base}, ${first}` : base;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
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
];

/** 'YYYY-MM-DD' → JS weekday (0 = Sunday), computed in UTC so it never shifts with the zone. */
export function weekdaySun0(date: ISODate): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

export function weekdayName(date: ISODate): string {
  return WEEKDAYS[weekdaySun0(date)] ?? '';
}

/** "Thursday 19 November". */
export function longDate(date: ISODate): string {
  const [, m, d] = date.split('-').map(Number);
  return `${weekdayName(date)} ${d ?? ''} ${MONTHS[(m ?? 1) - 1] ?? ''}`.trim();
}

/** "HH:MM" → minutes after midnight; null if not a valid clock time. */
export function clockMinutes(hhmm: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function minutesOfDay(now: number): number {
  const d = new Date(now);
  return d.getHours() * 60 + d.getMinutes();
}
