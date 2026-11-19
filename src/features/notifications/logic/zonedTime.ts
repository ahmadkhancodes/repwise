/**
 * Time-zone-aware wall-clock maths for the notification schedule (pure, no device clock).
 *
 * Every reminder is defined as a LOCAL wall time ("13:00 on 2026-03-08 in America/New_York") and
 * converted to an absolute instant here, so DST changes and travel never shift a meal reminder.
 * Uses Intl (Hermes ships it on iOS and Android); falls back to UTC for an unknown zone.
 */

/** Calendar date in the user's zone, `YYYY-MM-DD` (the same format as `sessions.date`). */
export type LocalDate = string;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** A valid IANA zone, or 'UTC'. */
export function safeTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return 'UTC';
  try {
    formatter(timeZone);
    return timeZone;
  } catch {
    return 'UTC';
  }
}

/** The device's current zone (changes when the user travels). */
export function deviceTimeZone(): string {
  try {
    return safeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return 'UTC';
  }
}

export type WallClock = {
  date: LocalDate;
  /** Minutes since local midnight, 0–1439. */
  minute: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
};

function parts(ms: number, timeZone: string) {
  const out: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    y: out.year ?? 1970,
    m: out.month ?? 1,
    d: out.day ?? 1,
    // Some engines print midnight as 24 even with h23.
    h: (out.hour ?? 0) % 24,
    mi: out.minute ?? 0,
    s: out.second ?? 0,
  };
}

/** UTC offset (ms) of `timeZone` at instant `ms` (e.g. -5h for New York in winter). */
export function offsetAt(ms: number, timeZone: string): number {
  const p = parts(ms, timeZone);
  const wallAsUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  return wallAsUtc - (ms - (((ms % 1000) + 1000) % 1000));
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function formatLocalDate(y: number, m: number, d: number): LocalDate {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

export function parseLocalDate(date: LocalDate): { y: number; m: number; d: number } {
  const [y, m, d] = date.split('-').map(Number);
  return { y: y ?? 1970, m: m ?? 1, d: d ?? 1 };
}

/** Wall clock of an instant in a zone. */
export function wallClock(ms: number, timeZone: string): WallClock {
  const p = parts(ms, timeZone);
  return {
    date: formatLocalDate(p.y, p.m, p.d),
    minute: p.h * 60 + p.mi,
    weekday: new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(),
  };
}

export function localDateOf(ms: number, timeZone: string): LocalDate {
  return wallClock(ms, timeZone).date;
}

export function addDays(date: LocalDate, n: number): LocalDate {
  const { y, m, d } = parseLocalDate(date);
  const t = new Date(Date.UTC(y, m - 1, d) + n * DAY);
  return formatLocalDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: LocalDate): number {
  const { y, m, d } = parseLocalDate(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * The instant at which the wall clock in `timeZone` reads `date` + `minuteOfDay`.
 *
 * - DST gap (spring forward, e.g. 02:30 does not exist): moves forward by the gap (→ 03:30),
 *   so the reminder still fires that morning.
 * - DST overlap (fall back, e.g. 01:30 happens twice): the FIRST occurrence.
 */
export function zonedTimeToUtc(date: LocalDate, minuteOfDay: number, timeZone: string): number {
  const { y, m, d } = parseLocalDate(date);
  const asUtc = Date.UTC(y, m - 1, d, 0, minuteOfDay);
  // A zone changes offset at most once in any 28 h window, so these two cover both sides.
  const before = offsetAt(asUtc - 14 * HOUR, timeZone);
  const after = offsetAt(asUtc + 14 * HOUR, timeZone);
  const valid = [...new Set([before, after])]
    .map((o) => asUtc - o)
    .filter((t) => asUtc - offsetAt(t, timeZone) === t);
  if (valid.length) return Math.min(...valid);
  // Gap: interpret with the offset in force before the jump.
  return asUtc - before;
}

/** "07:15" → 435. Returns null for anything that is not a valid 24 h time. */
export function parseHm(s: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((s ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/** 435 → "07:15" (wraps around midnight). */
export function formatHm(minuteOfDay: number): string {
  const v = ((Math.round(minuteOfDay) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(v / 60))}:${pad(v % 60)}`;
}
