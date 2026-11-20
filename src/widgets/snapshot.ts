/**
 * The widget snapshot (bible P-N2): one small JSON document written after every local change and
 * read by the Android widget task handler and the iOS WidgetKit extension (App Group). PURE.
 *
 * The Swift side decodes the same keys (targets/widget/Snapshot.swift) — keep them in sync and
 * bump `v` on a breaking change.
 */
import { addDays, parseLocalDate, type LocalDate } from '@/features/notifications/logic/zonedTime';

export const SNAPSHOT_VERSION = 1;

export type MacroPair = { eaten: number; target: number };

export type WidgetSnapshot = {
  v: number;
  updatedAt: number;
  date: LocalDate;
  /** Widgets are Pro (RW-64); everyone while payments are off. */
  pro: boolean;
  workout: {
    sessionId: string;
    title: string;
    exercises: number;
    minutes: number;
    status: 'planned' | 'active' | 'paused' | 'done' | 'skipped';
  } | null;
  /** `id` (planned meal id) enables the one-tap "Ate it" link; optional for older writers. */
  nextMeal: { id?: string; slot: string; label: string; name: string; kcal: number; time: string } | null;
  kcal: MacroPair;
  macros: { p: MacroPair; c: MacroPair; f: MacroPair };
  streakWeeks: number;
};

/** Deep links (scheme `repwise`) the widgets open. Quick log opens Eat with the log sheet. */
export const WIDGET_LINKS = {
  today: 'repwise://today',
  eat: 'repwise://eat',
  quickLog: 'repwise://eat?log=1',
  progress: 'repwise://progress',
  workout: (sessionId: string | null | undefined, start: boolean) =>
    sessionId
      ? `repwise://train?sessionId=${encodeURIComponent(sessionId)}${start ? '&start=1' : ''}`
      : 'repwise://train',
  /**
   * "Ate it" on the next meal: Eat ticks `mealId` (`tick=1`). Without an id it opens Eat,
   * where the meal is one more tap — still ≤ 2 taps from the widget.
   */
  tickMeal: (mealId: string | null | undefined) =>
    mealId ? `repwise://eat?mealId=${encodeURIComponent(mealId)}&tick=1` : 'repwise://eat',
} as const;

export type WorkoutCta = { label: 'Start' | 'Resume'; url: string } | null;

/** The widget's one-tap workout button: Start a planned session, Resume a running one. */
export function workoutCta(w: WidgetSnapshot['workout']): WorkoutCta {
  if (!w || !w.sessionId) return null;
  if (w.status === 'planned') return { label: 'Start', url: WIDGET_LINKS.workout(w.sessionId, true) };
  if (w.status === 'active' || w.status === 'paused') return { label: 'Resume', url: WIDGET_LINKS.workout(w.sessionId, true) };
  return null;
}

/** Workout headline and meta line, shared by every widget size. */
export function workoutLines(w: WidgetSnapshot['workout']): { title: string; meta: string } {
  if (!w) return { title: 'Rest day', meta: 'Recover and eat well' };
  const parts: string[] = [];
  if (w.exercises > 0) parts.push(`${w.exercises} exercise${w.exercises === 1 ? '' : 's'}`);
  if (w.minutes > 0) parts.push(`${w.minutes} min`);
  if (w.status === 'done') return { title: w.title, meta: 'Done today' };
  if (w.status === 'skipped') return { title: w.title, meta: 'Skipped' };
  if (w.status === 'active' || w.status === 'paused') return { title: w.title, meta: 'In progress' };
  return { title: w.title, meta: parts.join(' · ') };
}

export function emptySnapshot(date: LocalDate, now: number, pro: boolean): WidgetSnapshot {
  return {
    v: SNAPSHOT_VERSION,
    updatedAt: now,
    date,
    pro,
    workout: null,
    nextMeal: null,
    kcal: { eaten: 0, target: 0 },
    macros: { p: { eaten: 0, target: 0 }, c: { eaten: 0, target: 0 }, f: { eaten: 0, target: 0 } },
    streakWeeks: 0,
  };
}

/** Monday of the week containing `date` (ISO weeks). */
export function weekStart(date: LocalDate): LocalDate {
  const { y, m, d } = parseLocalDate(date);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(date, -((dow + 6) % 7));
}

/**
 * WG-3 "weeks in a row": consecutive ISO weeks with at least one finished workout, ending this
 * week — or last week, since the current week is still in progress and must not break a streak.
 */
export function weeksInARow(doneDates: LocalDate[], today: LocalDate): number {
  const weeks = new Set(doneDates.map(weekStart));
  let cursor = weekStart(today);
  if (!weeks.has(cursor)) cursor = addDays(cursor, -7);
  let n = 0;
  while (weeks.has(cursor)) {
    n++;
    cursor = addDays(cursor, -7);
  }
  return n;
}

export type MealForSnapshot = {
  id?: string;
  slot: string;
  name: string;
  kcal: number;
  p: number;
  c: number;
  f: number;
  status: string;
  /** "HH:mm" slot time. */
  time: string;
};

export type LogForSnapshot = {
  slot: string | null;
  source: string;
  kcal: number;
  p: number;
  c: number;
  f: number;
  mealId?: string | null;
};

/**
 * Eaten totals: every food log, plus planned meals ticked "Ate it" that have no plan-sourced log
 * of their own (so a meal is never counted twice, whichever way the meals screen logs it). Logs
 * match meals by meal id (several snacks share one slot); legacy logs without one by slot.
 */
export function eatenTotals(logs: LogForSnapshot[], meals: MealForSnapshot[]) {
  const plan = logs.filter((l) => l.source === 'plan' && l.slot);
  const byMeal = new Set(plan.map((l) => l.mealId).filter((id): id is string => !!id));
  const legacySlots = new Set(plan.filter((l) => !l.mealId).map((l) => l.slot));
  const anySlot = new Set(plan.map((l) => l.slot));
  const logged = (m: MealForSnapshot) => (m.id ? byMeal.has(m.id) || legacySlots.has(m.slot) : anySlot.has(m.slot));
  const rows = [...logs, ...meals.filter((m) => m.status === 'eaten' && !logged(m))];
  const sum = (k: 'kcal' | 'p' | 'c' | 'f') => Math.round(rows.reduce((a, r) => a + (r[k] || 0), 0));
  return { kcal: sum('kcal'), p: sum('p'), c: sum('c'), f: sum('f') };
}

/** The next planned meal at or after `nowHm`, else the first planned one left today. */
export function pickNextMeal(meals: MealForSnapshot[], nowHm: string): MealForSnapshot | null {
  const planned = meals.filter((m) => m.status === 'planned').sort((a, b) => a.time.localeCompare(b.time));
  return planned.find((m) => m.time >= nowHm) ?? planned[0] ?? null;
}

/** Ring fraction 0–1 (0 when there is no target). */
export function ringProgress(pair: MacroPair): number {
  if (!pair.target || pair.target <= 0) return 0;
  return Math.max(0, Math.min(1, pair.eaten / pair.target));
}

export function parseSnapshot(raw: string | null | undefined): WidgetSnapshot | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as WidgetSnapshot;
    return s && s.v === SNAPSHOT_VERSION && typeof s.date === 'string' ? s : null;
  } catch {
    return null;
  }
}

/**
 * A snapshot from an earlier day must not show yesterday's workout as today's: keep the streak,
 * clear the day's data until the app writes a fresh one.
 */
export function forDate(s: WidgetSnapshot | null, today: LocalDate, now: number): WidgetSnapshot {
  // No snapshot yet (widget added before the app ever ran): fail closed, never show Pro content.
  if (!s) return emptySnapshot(today, now, false);
  if (s.date === today) return s;
  return { ...emptySnapshot(today, s.updatedAt, s.pro), streakWeeks: s.streakWeeks };
}
