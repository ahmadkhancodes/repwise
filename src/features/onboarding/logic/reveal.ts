/**
 * View-model helpers for the S07 plan reveal (W1). Pure: the numbers come from the saved plan; these
 * only shape them for display.
 */
import { WEEKDAY_SHORT } from './options';

/** The build sequence; each line ticks when that part of the real computation is done. */
export const BUILD_STEPS = [
  'Calculating your calories and macros',
  'Choosing your training split',
  'Picking exercises for your equipment',
  'Planning meals around your diet',
  'Checking allergens and variety',
] as const;

/** Minimum time on the build screen so the sequence is readable (the work itself is faster). */
export const BUILD_MIN_MS = 2400;
export const BUILD_TICK_MS = 420;

/**
 * How many build lines are ticked after `elapsed` ms. Lines tick on a timer, but the last one waits
 * for the real plan (`done`), so the screen never claims work that has not happened.
 */
export function ticksAt(elapsed: number, done: boolean): number {
  const byTime = Math.floor(elapsed / BUILD_TICK_MS);
  const cap = done ? BUILD_STEPS.length : BUILD_STEPS.length - 1;
  return Math.max(0, Math.min(cap, byTime));
}

export function revealReady(elapsed: number, done: boolean): boolean {
  return done && elapsed >= BUILD_MIN_MS;
}

/** Share of the day's calories from each macro (4/4/9 kcal per g), each 0..1. */
export function macroShares(m: { kcal: number; protein: number; carbs: number; fat: number }) {
  const k = m.kcal > 0 ? m.kcal : 1;
  const clamp = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
  return {
    protein: clamp((m.protein * 4) / k),
    carbs: clamp((m.carbs * 4) / k),
    fat: clamp((m.fat * 9) / k),
  };
}

/** "Full body A · Barbell back squat" → "Full body A" (the session's day name). */
export function shortTitle(title: string | null | undefined): string {
  return (title ?? '').split(' · ')[0]!.trim();
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2027-03-14" → "14 Mar 2027" (or "14 Mar" when `withYear` is false). */
export function formatDay(iso: string, withYear = true): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return withYear ? `${d} ${MONTHS[m - 1]} ${y}` : `${d} ${MONTHS[m - 1]}`;
}

export type StripDay = {
  date: string;
  label: string;
  dayOfMonth: number;
  training: boolean;
  title: string;
  isToday: boolean;
  isPast: boolean;
};

/** Seven days from Monday with the planned session titles. */
export function weekStrip(
  dates: readonly string[],
  sessions: readonly { date: string | null; title: string | null }[],
  today: string,
): StripDay[] {
  const byDate = new Map(
    sessions.filter((s) => s.date).map((s) => [s.date as string, s.title ?? '']),
  );
  return dates.map((date, i) => ({
    date,
    label: WEEKDAY_SHORT[i % 7]!,
    dayOfMonth: Number(date.slice(8, 10)),
    training: byDate.has(date),
    title: shortTitle(byDate.get(date)),
    isToday: date === today,
    isPast: date < today,
  }));
}

/** The next training day on or after today, for the "rest day today" card. */
export function nextTraining(strip: readonly StripDay[], today: string): StripDay | null {
  return strip.find((d) => d.training && d.date >= today) ?? null;
}

/** kcal of a planned meal: per-serving kcal × the planned portion, rounded. */
export function mealKcal(perServingKcal: number | null | undefined, portion: number): number {
  return Math.round((perServingKcal ?? 0) * (Number.isFinite(portion) ? portion : 1));
}

export const SLOT_LABEL: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

/**
 * W1 reveal choreography in `motion.listStagger` units (20 ms), so every delay is a multiple of
 * the token: hero ring → macro rings → week strip → workout card and its lines → meals → CTA.
 * `start` is the first item's delay, `step` the gap between items of the same part.
 */
export const REVEAL_SEQUENCE = {
  hero: { start: 0, step: 0 },
  macro: { start: 14, step: 6 },
  week: { start: 24, step: 3 },
  workout: { start: 46, step: 4 },
  meals: { start: 62, step: 5 },
  cta: { start: 84, step: 0 },
  banner: { start: 8, step: 8 },
} as const;

export type RevealPart = keyof typeof REVEAL_SEQUENCE;

/** Delay (ms) of item `index` of a reveal part. Pure. */
export function revealDelay(
  motion: { listStagger: number },
  part: RevealPart,
  index = 0,
): number {
  const p = REVEAL_SEQUENCE[part];
  return (p.start + p.step * Math.max(0, index)) * motion.listStagger;
}

/** Build-screen polling interval (ms): 6 stagger units. */
export const BUILD_POLL_UNITS = 6;
