import { useCallback, useMemo, useRef, useState } from 'react';
import { View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

import { haptics } from '@/services/haptics';
import { Text } from '@/ui';
import { sizes, spacing, useTheme } from '@/theme';

import { labelIndices, nearestIndex, tickLabel } from '../logic/chart';

/** Room on the right for y-tick labels; a little air top and bottom (tokens only). */
export const CHART_PAD = {
  padTop: spacing.sm,
  padBottom: spacing.xs - sizes.borderThick,
  padLeft: 0,
  padRight: spacing.xxxl,
} as const;

/** Chart sizes derived from tokens (audit: no literals in charts). */
export function useChartSizes() {
  const t = useTheme();
  return useMemo(
    () => ({
      /** Line chart plot height (200). */
      lineHeight: t.sizes.ringHero - t.spacing.xxxl,
      /** Bar chart plot height (160). */
      barHeight: t.sizes.ring + t.spacing.xxxl,
      /** Sparkline tile height. */
      sparkHeight: t.sizes.touch + t.spacing.md,
      stroke: t.sizes.iconStrokeBold,
      /** Raw weigh-in dot radius. */
      dot: t.sizes.iconStrokeBold,
      /** Latest-value dot radius. */
      endDot: t.spacing.xxs,
      barGap: t.spacing.xs - t.sizes.borderThick,
      barRadius: t.spacing.xxs,
      /** Target tick across a bar. */
      target: t.sizes.borderThick,
      /** Grid dash pattern. */
      dash: [t.spacing.xxs - 1, t.spacing.xxs],
      /** Half the callout width used to centre it on the cursor. */
      calloutHalf: t.spacing.huge + t.spacing.sm,
    }),
    [t],
  );
}

export function useWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [width, setWidth] = useState(0);
  const onLayout = useCallback(
    (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width)),
    [],
  );
  return [width, onLayout];
}

export function YTicks({ ticks }: { ticks: { value: number; y: number }[] }) {
  const t = useTheme();
  return (
    <>
      {ticks.map((tick) => (
        <Text
          key={tick.value}
          variant="caption"
          color="textTertiary"
          tabular
          importantForAccessibility="no"
          accessibilityElementsHidden
          style={{
            position: 'absolute',
            right: 0,
            top: tick.y - t.typography.caption.lineHeight / 2,
          }}
        >
          {tickLabel(tick.value)}
        </Text>
      ))}
    </>
  );
}

export function XLabels({ labels }: { labels: string[] }) {
  const t = useTheme();
  const shown = labelIndices(labels.length, 4);
  if (labels.length === 0) return null;
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{
        flexDirection: 'row',
        justifyContent: shown.length === 1 ? 'center' : 'space-between',
        paddingRight: CHART_PAD.padRight,
        marginTop: t.spacing.xs,
      }}
    >
      {shown.map((i) => (
        <Text key={i} variant="caption" color="textTertiary" tabular>
          {labels[i]}
        </Text>
      ))}
    </View>
  );
}

/**
 * Touch-to-scrub over a chart: maps the finger's x to the nearest index from precomputed `xs`.
 * State only changes when the index changes (one render per new point, not per move event), and
 * the selection haptic fires once per change outside the state updater. Plain responder events
 * so it works in any scroll view on iOS and Android.
 */
export function useScrub(xs: readonly number[]) {
  const [index, setIndex] = useState<number | null>(null);
  const current = useRef<number | null>(null);
  const set = useCallback((next: number | null) => {
    if (current.current === next) return;
    current.current = next;
    if (next != null) haptics.selection();
    setIndex(next);
  }, []);
  const pick = useCallback(
    (e: GestureResponderEvent) => set(nearestIndex(xs, e.nativeEvent.locationX)),
    [xs, set],
  );
  const responder = useMemo(
    () => ({
      onStartShouldSetResponder: () => true,
      onMoveShouldSetResponder: () => true,
      onResponderGrant: pick,
      onResponderMove: pick,
      onResponderRelease: () => set(null),
      onResponderTerminate: () => set(null),
    }),
    [pick, set],
  );
  return { index, responder, clear: () => set(null) };
}
