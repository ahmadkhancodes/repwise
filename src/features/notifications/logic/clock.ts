import { formatHm, parseHm } from './zonedTime';

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** Does this device show 12-hour times? */
export function prefers12h(): boolean {
  try {
    const hc = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle;
    return hc === 'h11' || hc === 'h12';
  } catch {
    return false;
  }
}

/** "13:05" → "1:05 PM" (12 h) or "13:05" (24 h). Pure. */
export function displayTime(hm: string, h12: boolean): string {
  const m = parseHm(hm);
  if (m == null) return hm;
  if (!h12) return formatHm(m);
  const h = Math.floor(m / 60);
  const suffix = h < 12 ? 'AM' : 'PM';
  const h1 = h % 12 === 0 ? 12 : h % 12;
  return `${h1}:${String(m % 60).padStart(2, '0')} ${suffix}`;
}

/** Shift a "HH:mm" by minutes (wraps around midnight). */
export function shiftHm(hm: string, deltaMin: number): string {
  return formatHm((parseHm(hm) ?? 0) + deltaMin);
}

/** Minutes step the time picker uses; values are snapped to it. */
export const MINUTE_STEP = 5;

export function splitHm(hm: string): { hour: number; minute: number } {
  const m = parseHm(hm) ?? 0;
  const minute = Math.min(55, Math.round((m % 60) / MINUTE_STEP) * MINUTE_STEP);
  return { hour: Math.floor(m / 60), minute };
}

export function joinHm(hour: number, minute: number): string {
  return formatHm(hour * 60 + minute);
}

/**
 * "Today 13:00" / "Tomorrow 07:15" / "Wed 18:00" relative to `today` (all local dates).
 */
export function relativeDay(date: string, today: string, tomorrow: string, weekday: number): string {
  if (date === today) return 'Today';
  if (date === tomorrow) return 'Tomorrow';
  return WEEKDAYS[weekday]?.slice(0, 3) ?? date;
}

/** 24-hour hour → 12-hour wheel parts: 0 → 12 AM, 13 → 1 PM. Pure. */
export function to12h(hour: number): { hour12: number; pm: boolean } {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  return { hour12: h % 12 === 0 ? 12 : h % 12, pm: h >= 12 };
}

/** 12-hour wheel parts → 24-hour hour: 12 AM → 0, 12 PM → 12, 1 PM → 13. Pure. */
export function from12h(hour12: number, pm: boolean): number {
  const h = hour12 % 12;
  return pm ? h + 12 : h;
}
