/**
 * View-model helpers for the S07 plan reveal (W1). Pure: the numbers come from the saved plan; these
 * only shape them for display.
 */
import type { Cuisine, DietType, Goal } from '@/features/planner/engine';

import type { Location } from './answers';
import {
  CUISINE_OPTIONS,
  DIET_OPTIONS,
  GOAL_OPTIONS,
  labelOf,
  LOCATION_OPTIONS,
  WEEKDAY_SHORT,
} from './options';

/** One status line of the build screen: what is happening, plus the user's own answer. */
export type BuildLine = { text: string; detail: string | null };

/** The answers the build lines quote back (a subset of the quiz `Answers`). */
export type BuildAnswers = {
  goal: Goal | null;
  daysPerWeek: number | null;
  sessionMin: number | null;
  location: Location | null;
  dietType: DietType | null;
  cuisines: readonly Cuisine[];
  mealsPerDay: number | null;
};

/** The real work behind the build screen, in plain words (no medical or AI claims). */
export const BUILD_STEPS = [
  'Reading your goals…',
  'Picking exercises for your kit…',
  'Balancing your sets and rest…',
  'Cooking up your meals…',
  'Hitting your protein target…',
] as const;
export const BUILD_READY = 'Your plan is ready';

/**
 * Timeline (owner, 22 Nov): every work line holds {@link BUILD_LINE_MS}, then "Your plan is ready"
 * holds {@link BUILD_READY_HOLD_MS}: 5 × 680 + 700 = 4.1 s, inside the 3–5 s window. If the real
 * plan takes longer, the last work line stays until it is saved (the screen never claims work that
 * has not happened). Reduce motion: one static screen for {@link BUILD_REDUCED_MS}.
 */
export const BUILD_LINE_MS = 680;
export const BUILD_READY_HOLD_MS = 700;
export const BUILD_MIN_MS = 3000;
export const BUILD_MAX_MS = 5000;
export const BUILD_REDUCED_MS = 1200;
const WORK_MS = BUILD_STEPS.length * BUILD_LINE_MS;

/** "4 days a week · 60 min" */
export function scheduleLine(days: number | null, minutes: number | null): string | null {
  const parts = [
    days ? `${days} ${days === 1 ? 'day' : 'days'} a week` : null,
    minutes ? `${minutes} min` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** "American & British meals"; no pick = the US/UK default (D-CUISINE-DEFAULT). */
export function cuisineLine(cuisines: readonly Cuisine[], diet: DietType | null): string {
  const picked = cuisines.filter((c) => c !== 'global');
  const names = (picked.length ? picked : cuisines.length ? [] : (['american', 'british'] as const))
    .map((c) => labelOf(CUISINE_OPTIONS, c))
    .filter(Boolean);
  const food =
    names.length === 0
      ? 'Meals from everywhere'
      : names.length <= 2
        ? `${names.join(' & ')} meals`
        : `${names.slice(0, 2).join(', ')} & ${names.length - 2} more`;
  const dietLabel = diet && diet !== 'omnivore' ? labelOf(DIET_OPTIONS, diet) : '';
  return dietLabel ? `${dietLabel} · ${food}` : food;
}

/** The five work lines with the user's answers, then "Your plan is ready". Pure. */
export function buildLines(a: BuildAnswers): BuildLine[] {
  const location = LOCATION_OPTIONS.find((o) => o.value === a.location);
  const meals = a.mealsPerDay ? `${a.mealsPerDay} meals a day` : null;
  const details = [
    labelOf(GOAL_OPTIONS, a.goal) || null,
    location ? `${location.label} · ${location.detail ?? ''}`.replace(/ · $/, '') : null,
    scheduleLine(a.daysPerWeek, a.sessionMin),
    cuisineLine(a.cuisines, a.dietType),
    meals,
  ];
  return [
    ...BUILD_STEPS.map((text, i) => ({ text, detail: details[i] ?? null })),
    { text: BUILD_READY, detail: null },
  ];
}

/**
 * Index of the line on screen after `elapsed` ms (0..5; 5 = "Your plan is ready"). Lines move on a
 * timer, but "ready" waits for the saved plan (`done`).
 */
export function lineAt(elapsed: number, done: boolean): number {
  const byTime = Math.max(0, Math.floor(elapsed / BUILD_LINE_MS));
  return Math.min(byTime, done ? BUILD_STEPS.length : BUILD_STEPS.length - 1);
}

/** Ring progress 0..1: smooth with time, holds at the last work line until the plan is saved. */
export function buildProgress(elapsed: number, done: boolean): number {
  const p = Math.max(0, elapsed) / WORK_MS;
  const cap = done ? 1 : (BUILD_STEPS.length - 1) / BUILD_STEPS.length;
  return Math.min(cap, p);
}

/** When the reveal may show: after the full sequence (or the short static one) AND the real plan. */
export function revealAt(reduced: boolean): number {
  return reduced ? BUILD_REDUCED_MS : WORK_MS + BUILD_READY_HOLD_MS;
}

/**
 * The reveal may show after the full sequence (or the short static one) AND once the real plan is
 * saved (`doneAt`, ms since start; null = still working). A slow save still gets a beat on
 * "Your plan is ready" before the reveal.
 */
export function revealReady(elapsed: number, doneAt: number | null, reduced = false): boolean {
  if (doneAt === null) return false;
  const hold = reduced ? 0 : BUILD_READY_HOLD_MS;
  return elapsed >= Math.max(revealAt(reduced), doneAt + hold);
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
