import { Canvas, DashPathEffect, Group, Line, RoundedRect, vec } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo } from 'react';
import { View } from 'react-native';
import {
  useReducedMotion,
  useSharedValue,
  withSpring,
  useDerivedValue,
} from 'react-native-reanimated';

import { Text } from '@/ui';
import { useTheme, type ColorToken } from '@/theme';

import { layoutBars } from '../logic/chart';

import { CHART_PAD, XLabels, YTicks, useChartSizes, useScrub, useWidth } from './chartParts';

type Bar = { x: number; y: number; width: number; height: number; value: number };

/** One bar (memoised: a scrub only re-renders the bar whose colour changes). */
const BarRect = memo(function BarRect({
  b,
  r,
  color,
  min,
}: {
  b: Bar;
  r: number;
  color: string;
  min: number;
}) {
  return (
    <RoundedRect
      x={b.x}
      y={b.y}
      width={b.width}
      height={Math.max(b.height, b.value > 0 ? min : 0)}
      r={r}
      color={color}
    />
  );
});

export type BarChartProps = {
  values: number[];
  labels: string[];
  /** Optional per-bar target (dashed tick across the bar), e.g. kcal target. */
  targets?: (number | null)[];
  color?: ColorToken;
  /** Muted colour for all but the last (current) bar. */
  highlightLast?: boolean;
  height?: number;
  format: (v: number) => string;
  accessibilityLabel: string;
  testID?: string;
};

/** Skia bars that grow from the baseline with the shared spring; touch to read a value. */
export function BarChart({
  values,
  labels,
  targets,
  color = 'accent',
  highlightLast = true,
  height: heightProp,
  format,
  accessibilityLabel,
  testID,
}: BarChartProps) {
  const t = useTheme();
  const c = useChartSizes();
  const height = heightProp ?? c.barHeight;
  const reduceMotion = useReducedMotion();
  const [width, onLayout] = useWidth();
  const frame = useMemo(() => ({ width, height, ...CHART_PAD }), [width, height]);
  const key = values.join(',');
  const targetKey = targets?.join(',') ?? '';
  const layout = useMemo(
    () => layoutBars(values, frame, { gap: c.barGap, targets }),
    // keys stand in for the arrays (callers rebuild them every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, targetKey, frame, c.barGap],
  );
  const xs = useMemo(() => layout.bars.map((b) => b.x + b.width / 2), [layout]);
  const { index, responder } = useScrub(xs);

  const grow = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    grow.set(0);
    grow.set(reduceMotion ? 1 : withSpring(1, t.motion.spring));
  }, [key, reduceMotion, grow, t.motion.spring]);
  const baseY = height - CHART_PAD.padBottom;
  const transform = useDerivedValue(() => [{ scaleY: grow.value }]);
  const radius = Math.min(t.radius.button / 2, c.barRadius);

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
                p2={vec(width - CHART_PAD.padRight + t.spacing.xxs, tick.y)}
                color={t.colors.border}
                strokeWidth={t.sizes.hairline}
              >
                <DashPathEffect intervals={c.dash} />
              </Line>
            ))}
            <Group transform={transform} origin={vec(0, baseY)}>
              {layout.bars.map((b, i) => {
                const strong = !highlightLast || i === values.length - 1 || i === index;
                return (
                  <BarRect
                    key={i}
                    b={b}
                    r={radius}
                    min={t.sizes.borderThick}
                    color={strong ? t.colors[color] : t.colors.surface2}
                  />
                );
              })}
            </Group>
            {layout.targetYs.map((y, i) => {
              const b = layout.bars[i];
              if (y == null || !b) return null;
              return (
                <Line
                  key={`t${i}`}
                  p1={vec(b.x - c.target, y)}
                  p2={vec(b.x + b.width + c.target, y)}
                  color={t.colors.textPrimary}
                  strokeWidth={c.target}
                />
              );
            })}
          </Canvas>
        ) : null}
        <YTicks ticks={layout.ticksY} />
        {index != null ? (
          <View
            testID={testID ? `${testID}-callout` : undefined}
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: Math.min(
                Math.max(0, (xs[index] ?? 0) - c.calloutHalf),
                Math.max(0, width - c.calloutHalf * 2.4),
              ),
              backgroundColor: t.colors.inverse,
              borderRadius: t.radius.button,
              paddingHorizontal: t.spacing.xs,
              paddingVertical: t.spacing.xxs,
            }}
          >
            <Text variant="caption" color="onInverse" tabular>
              {`${labels[index] ?? ''} · ${format(values[index] ?? 0)}`}
              {targets?.[index] != null ? ` / ${format(targets[index] as number)}` : ''}
            </Text>
          </View>
        ) : null}
      </View>
      <XLabels labels={labels} />
    </View>
  );
}
