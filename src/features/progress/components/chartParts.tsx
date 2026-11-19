import { useCallback, useState } from 'react';
import { View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

import { haptics } from '@/services/haptics';
import { Text } from '@/ui';
import { useTheme } from '@/theme';

import { labelIndices, tickLabel } from '../logic/chart';

/** Room on the right for y-tick labels; a little air top and bottom. */
export const CHART_PAD = { padTop: 12, padBottom: 6, padLeft: 0, padRight: 40 } as const;

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
 * Touch-to-scrub over a chart: maps the finger's x to the nearest index (selection haptic on
 * change). Plain responder events so it works in any scroll view on iOS and Android.
 */
export function useScrub(count: number, xs: (i: number) => number) {
  const [index, setIndex] = useState<number | null>(null);
  const pick = useCallback(
    (e: GestureResponderEvent) => {
      if (count === 0) return;
      const x = e.nativeEvent.locationX;
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < count; i++) {
        const d = Math.abs(xs(i) - x);
        if (d < bestD) [best, bestD] = [i, d];
      }
      setIndex((prev) => {
        if (prev !== best) haptics.selection();
        return best;
      });
    },
    [count, xs],
  );
  const responder = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderGrant: pick,
    onResponderMove: pick,
    onResponderRelease: () => setIndex(null),
    onResponderTerminate: () => setIndex(null),
  };
  return { index, responder, clear: () => setIndex(null) };
}
