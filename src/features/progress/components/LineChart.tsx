import {
  Canvas,
  Circle,
  DashPathEffect,
  Group,
  Line,
  Path,
  Skia,
  vec,
  type SkPath,
} from '@shopify/react-native-skia';
import { memo, useEffect, useMemo } from 'react';
import { View } from 'react-native';
import {
  Easing,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { Text } from '@/ui';
import { useTheme, type ColorToken } from '@/theme';

import { areaPath, layoutLines, linePath, seriesXs, type Pt } from '../logic/chart';

import { CHART_PAD, XLabels, YTicks, useChartSizes, useScrub, useWidth } from './chartParts';

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

type Drawn = {
  label: string;
  color: string;
  dotsOnly: boolean;
  stroke: number;
  pts: Pt[];
  line: SkPath | null;
  area: SkPath | null;
};

/**
 * The static plot (grid + series). Memoised on its data and size: scrubbing re-renders only the
 * cursor, never re-parses paths, so the canvas stays still between draw-in and the next data.
 */
const LinePlot = memo(function LinePlot({
  drawn,
  ticksY,
  width,
  progress,
}: {
  drawn: Drawn[];
  ticksY: { value: number; y: number }[];
  width: number;
  progress: SharedValue<number>;
}) {
  const t = useTheme();
  const c = useChartSizes();
  return (
    <Group>
      {ticksY.map((tick) => (
        <Line
          key={tick.value}
          p1={vec(0, tick.y)}
          p2={vec(width - CHART_PAD.padRight + t.spacing.xxs, tick.y)}
          color={t.colors.border}
          strokeWidth={t.sizes.hairline}
        >
          <DashPathEffect intervals={c.dash} />
        </Line>
      ))}
      {drawn.map((s) => {
        if (s.dotsOnly) {
          return (
            <Group key={s.label} opacity={progress}>
              {s.pts.map((p, i) => (
                <Circle key={i} cx={p.x} cy={p.y} r={c.dot} color={s.color} />
              ))}
            </Group>
          );
        }
        const last = s.pts[s.pts.length - 1];
        return (
          <Group key={s.label}>
            {s.area ? <Path path={s.area} color={s.color} opacity={0.1} /> : null}
            {s.line ? (
              <Path
                path={s.line}
                color={s.color}
                style="stroke"
                strokeWidth={s.stroke}
                strokeCap="round"
                strokeJoin="round"
                end={progress}
              />
            ) : null}
            {last ? <Circle cx={last.x} cy={last.y} r={c.endDot} color={s.color} /> : null}
          </Group>
        );
      })}
    </Group>
  );
});

/** Skia line chart: grid, one or more series drawn in with a calm ease, touch-to-scrub. */
export function LineChart({
  series,
  labels,
  height: heightProp,
  format,
  accessibilityLabel,
  testID,
}: LineChartProps) {
  const t = useTheme();
  const c = useChartSizes();
  const height = heightProp ?? c.lineHeight;
  const reduceMotion = useReducedMotion();
  const [width, onLayout] = useWidth();
  const frame = useMemo(() => ({ width, height, ...CHART_PAD }), [width, height]);
  const dataKey = series.map((s) => `${s.label}:${s.values.join(',')}`).join('|');
  const layout = useMemo(
    () =>
      layoutLines(
        series.map((s) => s.values),
        frame,
        4,
      ),
    // dataKey stands in for `series` (callers rebuild the array every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataKey, frame],
  );
  const n = Math.max(0, ...series.map((s) => s.values.length));
  const xs = useMemo(() => seriesXs(layout.series, n), [layout, n]);
  const { index: sel, responder } = useScrub(xs);
  const baseY = height - CHART_PAD.padBottom;

  const colorKey = series
    .map((s) => `${s.color}${s.dotsOnly ? 'd' : ''}${s.area ? 'a' : ''}`)
    .join();
  const drawn = useMemo<Drawn[]>(
    () =>
      series.map((s, si) => {
        const pts = layout.series[si] ?? [];
        return {
          label: s.label,
          color: t.colors[s.color],
          dotsOnly: Boolean(s.dotsOnly),
          stroke: s.strokeWidth ?? c.stroke,
          pts,
          line: !s.dotsOnly && pts.length > 1 ? svg(linePath(pts)) : null,
          area: !s.dotsOnly && s.area && pts.length > 1 ? svg(areaPath(pts, baseY)) : null,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, colorKey, t.colors, c.stroke, baseY],
  );

  const progress = useSharedValue(reduceMotion ? 1 : 0);
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
            <LinePlot drawn={drawn} ticksY={layout.ticksY} width={width} progress={progress} />
            {sel != null ? (
              <Line
                p1={vec(xs[sel] ?? 0, CHART_PAD.padTop)}
                p2={vec(xs[sel] ?? 0, baseY)}
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
              left: Math.min(
                Math.max(0, (xs[sel] ?? 0) - c.calloutHalf),
                Math.max(0, width - c.calloutHalf * 2.6),
              ),
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
