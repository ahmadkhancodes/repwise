import { and, asc, desc, eq, isNotNull, isNull, ne, or, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';

import { getDb } from '@/db/client';
import { useLiveRows as useLiveQueryRows } from '@/db/live';
import { createRepo, type Row, type RowPatch } from '@/db/repo';
import {
  bodyMetrics,
  exercises,
  foodLogs,
  mealPlans,
  meals,
  photos,
  sessionExercises,
  sessions,
  sets,
  type SyncTable,
} from '@/db/schema';

import type { LoggedSetRow } from './logic/workouts';

export const bodyMetricsRepo = createRepo(bodyMetrics, 'body_metrics');
export const photosRepo = createRepo(photos, 'photos');
export type BodyMetric = Row<typeof bodyMetrics>;
export type ProgressPhoto = Row<typeof photos>;
export type BodyMetricPatch = Pick<
  RowPatch<typeof bodyMetrics>,
  | 'weightKg'
  | 'waistCm'
  | 'hipsCm'
  | 'chestCm'
  | 'armCm'
  | 'thighCm'
  | 'neckCm'
  | 'bodyFatPct'
  | 'note'
>;

export function latestWeight(): BodyMetric | undefined {
  return bodyMetricsRepo.first(and(isNotNull(bodyMetrics.weightKg)), desc(bodyMetrics.date));
}

export function useBodyMetrics(): BodyMetric[] {
  return bodyMetricsRepo.useLive(undefined, asc(bodyMetrics.date)).data;
}

export function usePhotos(): ProgressPhoto[] {
  return photosRepo.useLive(undefined, desc(photos.date)).data;
}

/**
 * Log body metrics for a date (S30 core action, RW-38 daily weigh-in). One row per date: a second
 * entry the same day updates that row (only the fields given), so the trend never double-counts.
 */
export function saveBodyMetric(
  date: string,
  patch: BodyMetricPatch,
  now: number = Date.now(),
): BodyMetric {
  const existing = bodyMetricsRepo.first(eq(bodyMetrics.date, date), desc(bodyMetrics.updatedAt));
  const values = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  ) as BodyMetricPatch;
  if (existing) return bodyMetricsRepo.update(existing.id, values, now) ?? existing;
  return bodyMetricsRepo.insert({ date, ...values }, now);
}

export function deleteBodyMetric(id: string, now: number = Date.now()): boolean {
  return bodyMetricsRepo.remove(id, now);
}

/** Photo row for a file already copied into private storage (see services/photoStore). */
export function addPhoto(
  values: { id?: string; date: string; localUri: string; pose?: string | null },
  now: number = Date.now(),
): ProgressPhoto {
  return photosRepo.insert(
    { id: values.id, date: values.date, localUri: values.localUri, pose: values.pose ?? null },
    now,
  );
}

export function deletePhoto(id: string, now: number = Date.now()): boolean {
  return photosRepo.remove(id, now);
}

/** Live rows with a loading flag (first result not in yet) and the error, for skeleton/error states. */
type Live<R> = { data: R[]; loading: boolean; error?: Error };

function useLiveRows<T extends SyncTable>(
  table: T,
  name: string,
  where?: SQL,
  orderBy?: SQL | SQLiteColumn,
  deps: unknown[] = [],
): Live<Row<T>> {
  // Synchronous first read, one refresh per frame, none while the screen is blurred (perf r2 N4).
  const res = useLiveQueryRows(
    () => {
      const t = table as unknown as typeof photos;
      const q = getDb().select().from(t).where(and(isNull(t.deletedAt), where));
      return (orderBy ? q.orderBy(orderBy) : q) as unknown as { all: () => Row<T>[] };
    },
    [name],
    deps,
  );
  return { data: res.data, loading: !res.loaded, error: res.error };
}

/** The tables a logged set is joined from; a write to any of them refreshes `useLiveLoggedSets`. */
export const LOGGED_SET_TABLES = ['sets', 'session_exercises', 'sessions'];

/**
 * Every ticked set joined to its exercise and session, in ONE indexed query (`sets_done_at_idx`),
 * with only the columns Progress reads. Replaces three whole-table live queries (sessions,
 * session_exercises, every set row) joined in JS (perf audit r2 N4). Skipped sessions are excluded,
 * as `flattenSets` did.
 */
export function loggedSetRows(): LoggedSetRow[] {
  return getDb()
    .select({
      id: sets.id,
      sessionId: sessionExercises.sessionId,
      exerciseId: sessionExercises.exerciseId,
      sessionDate: sessions.date,
      doneAt: sets.doneAt,
      type: sets.type,
      weightKg: sets.weightKg,
      reps: sets.reps,
    })
    .from(sets)
    .innerJoin(sessionExercises, eq(sets.sessionExerciseId, sessionExercises.id))
    .innerJoin(sessions, eq(sessionExercises.sessionId, sessions.id))
    .where(
      and(
        isNotNull(sets.doneAt),
        isNull(sets.deletedAt),
        isNull(sessionExercises.deletedAt),
        isNull(sessions.deletedAt),
        or(isNull(sessions.status), ne(sessions.status, 'skipped')),
      ),
    )
    .orderBy(asc(sets.doneAt))
    .all() as LoggedSetRow[];
}

export function useLiveLoggedSets(): Live<LoggedSetRow> {
  const res = useLiveQueryRows(() => ({ all: loggedSetRows }), LOGGED_SET_TABLES, []);
  return { data: res.data, loading: !res.loaded, error: res.error };
}

export const useLiveBody = () =>
  useLiveRows(bodyMetrics, 'body_metrics', undefined, asc(bodyMetrics.date));
export const useLivePhotos = () => useLiveRows(photos, 'photos', undefined, desc(photos.date));
export const useLiveSessions = () => useLiveRows(sessions, 'sessions', undefined, asc(sessions.date));
export const useLiveFoodLogs = () =>
  useLiveRows(foodLogs, 'food_logs', undefined, asc(foodLogs.date));
export const useLiveMealPlans = () =>
  useLiveRows(mealPlans, 'meal_plans', undefined, asc(mealPlans.date));
export const useLiveMeals = () => useLiveRows(meals, 'meals');
/** User-created exercises (the catalogue is @repwise/content). */
export const useLiveCustomExercises = () => useLiveRows(exercises, 'exercises');
