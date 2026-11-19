import {
  Canvas,
  Circle,
  DashPathEffect,
  Group,
  Line,
  Path,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import { useCallback, useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { Easing, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { Text } from '@/ui';
import { useTheme, type ColorToken } from '@/theme';

import { areaPath, layoutLines, linePath } from '../logic/chart';

import { CHART_PAD, XLabels, YTicks, useScrub, useWidth } from './chartParts';

export type LineSeries = {
  values: number[];
  color: ColorToken;
  /** Draw dots at each value (raw weigh-ins) instead of a line. */
  dotsOnly?: boolean;
  /** Soft fill under the line. */
  area?: boolean;
  strokeWidth?: number;
  label: string;
};

export type LineChartProps = {
  series: LineSeries[];
  labels: string[];
  height?: number;
  /** Value formatter for the scrub callout, e.g. v => `${v} kg`. */
  format: (v: number) => string;
  /** Spoken summary, e.g. "Weight trend, 3 months, down 1.2 kg". */
  accessibilityLabel: string;
  testID?: string;
};

const svg = (d: string) => Skia.Path.MakeFromSVGString(d) ?? Skia.Path.Make();

/** Skia line chart: grid, one or more series drawn in with a calm ease, touch-to-scrub. */
export function LineChart({
  series,
  labels,
  height = 200,
  format,
  accessibilityLabel,
  testID,
}: LineChartProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const [width, onLayout] = useWidth();
  const frame = useMemo(() => ({ width, height, ...CHART_PAD }), [width, height]);
  const layout = useMemo(
    () =>
      layoutLines(
        series.map((s) => s.values),
        frame,
        4,
      ),
    [series, frame],
  );
  const n = Math.max(0, ...series.map((s) => s.values.length));
  const xs = useCallback(
    (i: number) => layout.series.find((s) => s.length > i)?.[i]?.x ?? 0,
    [layout],
  );
  const { index, responder } = useScrub(n, xs);

  const progress = useSharedValue(reduceMotion ? 1 : 0);
  const dataKey = series.map((s) => s.values.join(',')).join('|');
  useEffect(() => {
    if (reduceMotion) {
      progress.set(1);
      return;
    }
    progress.set(0);
    progress.set(
      withTiming(1, { duration: t.motion.duration.slow * 3, easing: Easing.out(Easing.cubic) }),
    );
  }, [dataKey, reduceMotion, progress, t.motion.duration.slow]);

  const baseY = height - CHART_PAD.padBottom;
  const sel = index != null ? index : null;

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <View
        onLayout={onLayout}
        style={{ height }}
        {...responder}
        testID={testID ? `${testID}-plot` : undefined}
      >
        {width > 0 ? (
          <Canvas style={{ width, height }}>
            {layout.ticksY.map((tick) => (
              <Line
                key={tick.value}
                p1={vec(0, tick.y)}
                p2={vec(width - CHART_PAD.padRight + 4, tick.y)}
                color={t.colors.border}
                strokeWidth={t.sizes.hairline}
              >
                <DashPathEffect intervals={[3, 4]} />
              </Line>
            ))}
            {series.map((s, si) => {
              const pts = layout.series[si] ?? [];
              const color = t.colors[s.color];
              if (s.dotsOnly) {
                return (
                  <Group key={s.label} opacity={progress}>
                    {pts.map((p, i) => (
                      <Circle key={i} cx={p.x} cy={p.y} r={2.5} color={color} />
                    ))}
                  </Group>
                );
              }
              return (
                <Group key={s.label}>
                  {s.area && pts.length > 1 ? (
                    <Path path={svg(areaPath(pts, baseY))} color={color} opacity={0.1} />
                  ) : null}
                  {pts.length > 1 ? (
                    <Path
                      path={svg(linePath(pts))}
                      color={color}
                      style="stroke"
                      strokeWidth={s.strokeWidth ?? 2.5}
                      strokeCap="round"
                      strokeJoin="round"
                      end={progress}
                    />
                  ) : null}
                  {pts.length > 0 ? (
                    <Circle
                      cx={pts[pts.length - 1]!.x}
                      cy={pts[pts.length - 1]!.y}
                      r={4}
                      color={color}
                    />
                  ) : null}
                </Group>
              );
            })}
            {sel != null ? (
              <Line
                p1={vec(xs(sel), CHART_PAD.padTop)}
                p2={vec(xs(sel), baseY)}
                color={t.colors.textTertiary}
                strokeWidth={t.sizes.hairline}
              />
            ) : null}
          </Canvas>
        ) : null}
        <YTicks ticks={layout.ticksY} />
        {sel != null ? (
          <View
            testID={testID ? `${testID}-callout` : undefined}
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: Math.min(Math.max(0, xs(sel) - 60), Math.max(0, width - 160)),
              backgroundColor: t.colors.inverse,
              borderRadius: t.radius.button,
              paddingHorizontal: t.spacing.xs,
              paddingVertical: t.spacing.xxs,
            }}
          >
            <Text variant="caption" color="onInverse" tabular>
              {labels[sel] ?? ''}
              {series
                .map((s) => (s.values[sel] != null ? ` · ${format(s.values[sel] as number)}` : ''))
                .join('')}
            </Text>
          </View>
        ) : null}
      </View>
      <XLabels labels={labels} />
    </View>
  );
}
