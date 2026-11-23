/**
 * Home dashboard data (Today stats grid): small indexed reads from local SQLite plus the daily
 * steps table. Kept out of the main Today snapshot so a logged set or a weigh-in only re-runs
 * these cheap queries, never the meal/workout ones (perf audit A2).
 */
import { and, between, desc, eq, gte, isNotNull, isNull, lte, ne, or } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { createRepo, type Row } from '@/db/repo';
import { bodyMetrics, dailySteps, sessionExercises, sessions, sets } from '@/db/schema';

import type { VolumeSet } from './logic/stats';
import { doneWorkoutDates } from './repo';

export const dailyStepsRepo = createRepo(dailySteps, 'daily_steps');
export type DailySteps = Row<typeof dailySteps>;

/** Tables the dashboard reads (it reloads when any of them changes, only while focused). */
export const DASHBOARD_TABLES = ['sets', 'sessions', 'session_exercises', 'body_metrics', 'daily_steps'] as const;

export function stepsForDate(date: string): DailySteps | undefined {
  return dailyStepsRepo.first(eq(dailySteps.date, date), desc(dailySteps.updatedAt));
}

/**
 * Store the day's step total (one row per date). Writes only when the number changed, so the
 * sync engine never sees a dirty row for a re-read of the same total.
 */
export function saveDailySteps(date: string, steps: number, source: string, now: number = Date.now()): void {
  const value = Math.max(0, Math.round(steps));
  const existing = stepsForDate(date);
  if (existing) {
    if (existing.steps === value && existing.source === source) return;
    dailyStepsRepo.update(existing.id, { steps: value, source }, now);
    return;
  }
  dailyStepsRepo.insert({ date, steps: value, source }, now);
}

/** Finished sets of sessions dated in [from, to] (weekly volume). */
export function weekSets(from: string, to: string): VolumeSet[] {
  return getDb()
    .select({
      sessionDate: sessions.date,
      type: sets.type,
      weightKg: sets.weightKg,
      reps: sets.reps,
      doneAt: sets.doneAt,
    })
    .from(sets)
    .innerJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
    .innerJoin(sessions, eq(sessionExercises.sessionId, sessions.id))
    .where(
      and(
        between(sessions.date, from, to),
        isNotNull(sets.doneAt),
        isNull(sets.deletedAt),
        isNull(sessionExercises.deletedAt),
        isNull(sessions.deletedAt),
        or(isNull(sessions.status), ne(sessions.status, 'skipped')),
      ),
    )
    .all();
}

/** Weigh-ins dated in [from, to]. */
export function weightsBetween(from: string, to: string): { date: string; weightKg: number | null }[] {
  return getDb()
    .select({ date: bodyMetrics.date, weightKg: bodyMetrics.weightKg })
    .from(bodyMetrics)
    .where(
      and(
        gte(bodyMetrics.date, from),
        lte(bodyMetrics.date, to),
        isNotNull(bodyMetrics.weightKg),
        isNull(bodyMetrics.deletedAt),
      ),
    )
    .orderBy(bodyMetrics.date, bodyMetrics.updatedAt)
    .all();
}

export type DashboardSnapshot = {
  weekSets: VolumeSet[];
  weights: { date: string; weightKg: number | null }[];
  doneDates: string[];
  steps: number | null;
};

export function loadDashboard(date: string, weekFrom: string, weekTo: string, weightFrom: string): DashboardSnapshot {
  return {
    weekSets: weekSets(weekFrom, weekTo),
    weights: weightsBetween(weightFrom, date),
    doneDates: doneWorkoutDates(),
    steps: stepsForDate(date)?.steps ?? null,
  };
}
