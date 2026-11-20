import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Skeleton, SkeletonCard, SkeletonGroup, SkeletonText } from '@/ui';

import { useChartSizes } from './chartParts';

/**
 * Loading states shaped like what loads (sheet 11: "shimmer blocks per component"), built only
 * from the shared `src/ui` skeleton primitives. Every one keeps the `progress-skeleton` testID
 * by default so tests and flows find "loading" the same way on every screen.
 */

type P = { testID?: string };
const ID = 'progress-skeleton';

/** S29 home: streak card, calendar, tiles. */
export function HomeSkeleton({ testID = ID }: P) {
  const t = useTheme();
  return (
    <SkeletonGroup label="Loading progress" testID={testID} style={{ gap: t.spacing.md }}>
      <SkeletonCard lines={1} bodyHeight={t.sizes.touch} />
      <Skeleton height={t.sizes.ringHero + t.spacing.xxxl} radius={t.radius.card} />
      <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Skeleton height={t.sizes.ring + t.spacing.xxl} radius={t.radius.card} />
        </View>
        <View style={{ flex: 1 }}>
          <Skeleton height={t.sizes.ring + t.spacing.xxl} radius={t.radius.card} />
        </View>
      </View>
    </SkeletonGroup>
  );
}

/** Body / exercise / trends: hero number, then a chart. */
export function ChartSkeleton({ testID = ID }: P) {
  const t = useTheme();
  const c = useChartSizes();
  return (
    <SkeletonGroup label="Loading chart" testID={testID} style={{ gap: t.spacing.md }}>
      <SkeletonText variant="display" lines={1} lastLineWidth="45%" />
      <Skeleton height={c.lineHeight} radius={t.radius.card} />
      <SkeletonText variant="callout" lines={2} />
    </SkeletonGroup>
  );
}

/** Lists (records, history): rows with a title and a value. */
export function RowsSkeleton({ testID = ID, rows = 6 }: P & { rows?: number }) {
  const t = useTheme();
  return (
    <SkeletonGroup label="Loading" testID={testID} style={{ gap: t.spacing.lg }}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
          <View style={{ flex: 1 }}>
            <SkeletonText variant="callout" lines={2} lastLineWidth={`${35 + (i % 3) * 12}%`} />
          </View>
          <Skeleton height={t.spacing.md} width={t.sizes.row} radius={t.radius.pill} />
        </View>
      ))}
    </SkeletonGroup>
  );
}

/** S33 photos: the 3-column grid. */
export function PhotoGridSkeleton({ testID = ID }: P) {
  const t = useTheme();
  return (
    <SkeletonGroup label="Loading photos" testID={testID}>
      {[0, 1].map((r) => (
        <View key={r} style={{ flexDirection: 'row', gap: t.spacing.xs }}>
          {[0, 1, 2].map((c) => (
            <View key={c} style={{ flex: 1, aspectRatio: 3 / 4 }}>
              <Skeleton height={t.sizes.ring + t.spacing.xxxl} radius={t.radius.button} />
            </View>
          ))}
        </View>
      ))}
    </SkeletonGroup>
  );
}

/** S34 Wrapped: the story bar and one 4:5 card. */
export function WrappedSkeleton({ testID = ID }: P) {
  const t = useTheme();
  return (
    <SkeletonGroup label="Loading your month" testID={testID} style={{ gap: t.spacing.md }}>
      <Skeleton height={t.spacing.xxs} radius={t.radius.pill} />
      <Skeleton
        height={(t.sizes.ringHero + t.spacing.xxxl) * 1.4}
        radius={t.radius.card + t.spacing.xs}
      />
    </SkeletonGroup>
  );
}

/** S32 heatmap: the side switch, the figure and a few muscle rows. */
export function HeatmapSkeleton({ testID = ID }: P) {
  const t = useTheme();
  return (
    <SkeletonGroup label="Loading muscle map" testID={testID} style={{ gap: t.spacing.md }}>
      <Skeleton height={t.sizes.touch} radius={t.radius.button} />
      <View style={{ alignItems: 'center' }}>
        <Skeleton
          height={t.sizes.ringHero + t.spacing.huge * 2}
          width={t.sizes.ring + t.spacing.xxxl}
          radius={t.radius.pill}
        />
      </View>
      <SkeletonText variant="callout" lines={3} />
    </SkeletonGroup>
  );
}
