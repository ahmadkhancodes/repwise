/** Cook mode helpers (S24 wow moment): per-step timers parsed from the step text. Pure. */

export type StepTimer = { seconds: number; label: string };

const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600 };

const TIMER_RE =
  /(\d+(?:\.\d+)?)(?:\s*(?:–|—|-|to)\s*(\d+(?:\.\d+)?))?\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/i;

/**
 * First duration mentioned in a step ("simmer for 10–12 minutes" → 12 min). Ranges use the upper
 * bound so the timer never rings before the food is ready. Null when the step has no duration.
 */
export function parseStepTimer(step: string): StepTimer | null {
  const m = TIMER_RE.exec(step);
  if (!m) return null;
  const lo = Number(m[1]);
  const hi = m[2] ? Number(m[2]) : lo;
  const unit = (m[3] ?? 'm').toLowerCase().startsWith('h')
    ? 'h'
    : (m[3] ?? '').toLowerCase().startsWith('s')
      ? 's'
      : 'm';
  const seconds = Math.round(Math.max(lo, hi) * (UNIT_SECONDS[unit] ?? 60));
  if (!(seconds > 0) || seconds > 12 * 3600) return null;
  return { seconds, label: formatDuration(seconds) };
}

/** "12 min", "1 h 30 min", "45 s". */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Countdown clock: "09:59", "1:05:00". Negative values clamp to 0. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Remaining seconds of a running timer from its end time (robust to JS timer drift). */
export function remainingSeconds(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}
