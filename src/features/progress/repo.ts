import { and, asc, desc, eq, isNotNull, isNull, type SQL } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';

import { getDb } from '@/db/client';
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
  where?: SQL,
  orderBy?: SQL | SQLiteColumn,
  deps: unknown[] = [],
): Live<Row<T>> {
  const t = table as unknown as typeof photos;
  const base = and(isNull(t.deletedAt), where);
  const q = getDb().select().from(t).where(base);
  const res = useLiveQuery(orderBy ? q.orderBy(orderBy) : q, deps);
  return {
    data: res.data as Row<T>[],
    loading: res.updatedAt === undefined && !res.error,
    error: res.error,
  };
}

export const useLiveBody = () => useLiveRows(bodyMetrics, undefined, asc(bodyMetrics.date));
export const useLivePhotos = () => useLiveRows(photos, undefined, desc(photos.date));
export const useLiveSessions = () => useLiveRows(sessions, undefined, asc(sessions.date));
export const useLiveSessionExercises = () => useLiveRows(sessionExercises);
/** Only ticked sets matter for progress. */
export const useLiveDoneSets = () => useLiveRows(sets, isNotNull(sets.doneAt), asc(sets.doneAt));
export const useLiveFoodLogs = () => useLiveRows(foodLogs, undefined, asc(foodLogs.date));
export const useLiveMealPlans = () => useLiveRows(mealPlans, undefined, asc(mealPlans.date));
export const useLiveMeals = () => useLiveRows(meals);
/** User-created exercises (the catalogue is @repwise/content). */
export const useLiveCustomExercises = () => useLiveRows(exercises);
