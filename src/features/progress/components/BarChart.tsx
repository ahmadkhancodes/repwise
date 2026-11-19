import { Canvas, DashPathEffect, Group, Line, RoundedRect, vec } from '@shopify/react-native-skia';
import { useCallback, useEffect, useMemo } from 'react';
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

import { CHART_PAD, XLabels, YTicks, useScrub, useWidth } from './chartParts';

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
  height = 160,
  format,
  accessibilityLabel,
  testID,
}: BarChartProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const [width, onLayout] = useWidth();
  const frame = useMemo(() => ({ width, height, ...CHART_PAD }), [width, height]);
  const layout = useMemo(
    () => layoutBars(values, frame, { gap: 6, targets }),
    [values, frame, targets],
  );
  const xs = useCallback(
    (i: number) => {
      const b = layout.bars[i];
      return b ? b.x + b.width / 2 : 0;
    },
    [layout],
  );
  const { index, responder } = useScrub(values.length, xs);

  const grow = useSharedValue(reduceMotion ? 1 : 0);
  const key = values.join(',');
  useEffect(() => {
    grow.set(0);
    grow.set(reduceMotion ? 1 : withSpring(1, t.motion.spring));
  }, [key, reduceMotion, grow, t.motion.spring]);
  const baseY = height - CHART_PAD.padBottom;
  const transform = useDerivedValue(() => [{ scaleY: grow.value }]);
  const radius = Math.min(t.radius.button / 2, 4);

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
            <Group transform={transform} origin={vec(0, baseY)}>
              {layout.bars.map((b, i) => {
                const strong = !highlightLast || i === values.length - 1 || i === index;
                return (
                  <RoundedRect
                    key={i}
                    x={b.x}
                    y={b.y}
                    width={b.width}
                    height={Math.max(b.height, b.value > 0 ? 2 : 0)}
                    r={radius}
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
                  p1={vec(b.x - 2, y)}
                  p2={vec(b.x + b.width + 2, y)}
                  color={t.colors.textPrimary}
                  strokeWidth={2}
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
              left: Math.min(Math.max(0, xs(index) - 50), Math.max(0, width - 140)),
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
