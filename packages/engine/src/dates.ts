/**
 * Calendar-date helpers. Plans are keyed by LOCAL calendar dates ('YYYY-MM-DD').
 * All arithmetic is done on day numbers via Date.UTC, so it never depends on the
 * host time zone and DST transitions cannot produce 23/25-hour "days".
 * No Date.now() anywhere: callers pass `now`.
 */

const MS_PER_DAY = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type ISODate = string;

/** Parse 'YYYY-MM-DD' into a day number (days since 1970-01-01). Throws on invalid dates. */
export function toDayNumber(date: ISODate): number {
  const m = ISO_RE.exec(date);
  if (!m) throw new RangeError(`invalid ISO date: ${date}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const ms = Date.UTC(y, mo - 1, d);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    throw new RangeError(`invalid calendar date: ${date}`);
  }
  return Math.round(ms / MS_PER_DAY);
}

export function fromDayNumber(n: number): ISODate {
  const d = new Date(n * MS_PER_DAY);
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function isValidISODate(date: string): boolean {
  try {
    toDayNumber(date);
    return true;
  } catch {
    return false;
  }
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** Whole calendar days from a to b (b − a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return toDayNumber(b) - toDayNumber(a);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayMon0(date: ISODate): number {
  // 1970-01-01 was a Thursday (index 3).
  return (((toDayNumber(date) + 3) % 7) + 7) % 7;
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: ISODate): ISODate {
  return addDays(date, -weekdayMon0(date));
}

/** The 7 consecutive local dates starting at `start` (Monday-aligned by the caller). */
export function weekDates(start: ISODate): ISODate[] {
  const n = toDayNumber(start);
  return Array.from({ length: 7 }, (_, i) => fromDayNumber(n + i));
}

/**
 * Local calendar date of an instant, given the UTC offset in minutes at that instant
 * (e.g. +60 for CET, −240 for EDT). The device passes its current offset.
 */
export function localDateFromEpoch(epochMs: number, utcOffsetMinutes: number): ISODate {
  return fromDayNumber(Math.floor((epochMs + utcOffsetMinutes * 60_000) / MS_PER_DAY));
}

export function compareDates(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Whole years of age at `onDate` given only a birth year (data model stores birth_year). */
export function ageFromBirthYear(birthYear: number, onDate: ISODate): number {
  return Number(onDate.slice(0, 4)) - birthYear;
}
