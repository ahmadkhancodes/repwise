/** Session clock maths (time only; no training maths here). */

export type SessionTimes = {
  startedAt: number | null;
  endedAt: number | null;
  pausedMs: number | null;
};

/** Active time: start → end (or now), minus paused time and any pause still open. */
export function activeMs(s: SessionTimes, now: number, openPauseSince?: number | null): number {
  if (s.startedAt == null) return 0;
  const end = s.endedAt ?? now;
  const openPause = s.endedAt == null && openPauseSince != null ? Math.max(0, now - openPauseSince) : 0;
  return Math.max(0, end - s.startedAt - (s.pausedMs ?? 0) - openPause);
}

/** "4:05", "52:10", "1:05:09" — the live player clock. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Countdown text that never shows a negative: "1:30", "0:05". Rounds up so 0:00 means done. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** "52 min", "1 h 5 min" — summaries and cards. */
export function formatMinutes(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Analytics `duration_bucket` (sheet 23) — buckets only, never the exact time. */
export function durationBucket(ms: number): string {
  const min = ms / 60_000;
  if (min < 30) return '<30';
  if (min < 45) return '30-45';
  if (min < 60) return '45-60';
  if (min < 90) return '60-90';
  return '90+';
}

const WORK_S_PER_SET = 45;
const SETUP_S_PER_EXERCISE = 60;

/** Session estimate for cards and the overview: sets × (work + rest) + set-up per exercise. */
export function estimateMinutes(
  items: { sets: number; restS: number | null | undefined }[],
): number {
  const s = items.reduce(
    (acc, it) => acc + it.sets * (WORK_S_PER_SET + (it.restS ?? 90)) + SETUP_S_PER_EXERCISE,
    0,
  );
  return Math.round(s / 60);
}
