import { and, asc, desc, isNotNull } from 'drizzle-orm';

import { createRepo, type Row } from '@/db/repo';
import { bodyMetrics, photos } from '@/db/schema';

export const bodyMetricsRepo = createRepo(bodyMetrics, 'body_metrics');
export const photosRepo = createRepo(photos, 'photos');
export type BodyMetric = Row<typeof bodyMetrics>;
export type ProgressPhoto = Row<typeof photos>;

export function latestWeight(): BodyMetric | undefined {
  return bodyMetricsRepo.first(and(isNotNull(bodyMetrics.weightKg)), desc(bodyMetrics.date));
}

export function useBodyMetrics(): BodyMetric[] {
  return bodyMetricsRepo.useLive(undefined, asc(bodyMetrics.date)).data;
}

export function usePhotos(): ProgressPhoto[] {
  return photosRepo.useLive(undefined, desc(photos.date)).data;
}
