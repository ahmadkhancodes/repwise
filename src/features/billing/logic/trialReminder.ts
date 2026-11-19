import { TRIAL_REMINDER_DAYS_BEFORE_END } from '../config';

const DAY = 24 * 60 * 60 * 1000;

/** Local quiet hours (sheet 17 default 22:00–07:00). Hours 0–23; may wrap midnight. */
export type QuietHours = { start: number; end: number };
export const DEFAULT_QUIET_HOURS: QuietHours = { start: 22, end: 7 };

export function inQuietHours(d: Date, q: QuietHours): boolean {
  const h = d.getHours() + d.getMinutes() / 60;
  return q.start > q.end ? h >= q.start || h < q.end : h >= q.start && h < q.end;
}

/** Trial end from its start (ms) and length in days. */
export function trialEndFromStart(trialStart: number, trialDays = 7): number {
  return trialStart + trialDays * DAY;
}

/**
 * N-T5 "Your free trial ends in 2 days" (sheet 05 + 17): trial day 5 of a 7-day trial,
 * i.e. exactly 2 days before the trial ends, at the same local clock time. Pure.
 *
 * If that time is inside quiet hours it moves EARLIER to the last minute before quiet
 * hours start (never later, so the user always gets at least 2 days' notice).
 * Returns null when the reminder time has already passed.
 */
export function trialReminderAt(
  trialEnd: number,
  opts: { now?: number; quietHours?: QuietHours; daysBeforeEnd?: number } = {},
): Date | null {
  const q = opts.quietHours ?? DEFAULT_QUIET_HOURS;
  const at = new Date(trialEnd - (opts.daysBeforeEnd ?? TRIAL_REMINDER_DAYS_BEFORE_END) * DAY);
  if (inQuietHours(at, q)) {
    // Step back to the quiet-hours start on the right evening, minus one minute.
    const s = new Date(at);
    s.setHours(q.start, 0, 0, 0);
    if (s.getTime() > at.getTime()) s.setDate(s.getDate() - 1);
    s.setMinutes(s.getMinutes() - 1);
    at.setTime(s.getTime());
  }
  if (opts.now != null && at.getTime() <= opts.now) return null;
  return at;
}
