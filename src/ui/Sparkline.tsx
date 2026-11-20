import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia';
import { memo, useMemo, useState } from 'react';
import { View } from 'react-native';

import { useTheme, type ColorToken } from '@/theme';

export type SparkPoint = { x: number; y: number };

/**
 * Values → points filling a `width × height` box inset by `pad` (higher value = higher on
 * screen). A flat series sits on the middle line. Non-finite values are dropped. Pure.
 */
export function sparkPoints(
  values: readonly number[],
  width: number,
  height: number,
  pad: number,
): SparkPoint[] {
  const vs = values.filter((v) => Number.isFinite(v));
  if (vs.length < 2 || width <= 0 || height <= 0) return [];
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const span = max - min;
  const w = Math.max(0, width - pad * 2);
  const h = Math.max(0, height - pad * 2);
  return vs.map((v, i) => ({
    x: pad + (w * i) / (vs.length - 1),
    y: pad + (span === 0 ? h / 2 : h - ((v - min) / span) * h),
  }));
}

/** "M x y L x y …" for Skia. Pure. */
export function sparkPath(pts: readonly SparkPoint[]): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
}

export type SparklineProps = {
  values: readonly number[];
  /** Fixed width; omit to fill the parent (measured once on layout). */
  width?: number;
  /** Default: touch + md (64dp). */
  height?: number;
  color?: ColorToken;
  testID?: string;
};

/**
 * The one trend sparkline (UI audit P2-5: Progress tiles AND the check-in weight trend): a static
 * Skia line with an accent end dot. No grid, no animation, one draw per data change. Decorative —
 * the numbers beside it are spoken.
 */
export const Sparkline = memo(function Sparkline({
  values,
  width: fixedWidth,
  height: heightProp,
  color = 'textPrimary',
  testID = 'sparkline',
}: SparklineProps) {
  const t = useTheme();
  const [measured, setMeasured] = useState(0);
  const width = fixedWidth ?? measured;
  const height = heightProp ?? t.sizes.touch + t.spacing.md;
  const dot = t.spacing.xxs;
  const key = values.join(',');
  const pts = useMemo(
    () => sparkPoints(values, width, height, dot + t.sizes.hairline),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, width, height, dot, t.sizes.hairline],
  );
  const path = useMemo(
    () => (pts.length > 1 ? (Skia.Path.MakeFromSVGString(sparkPath(pts)) ?? null) : null),
    [pts],
  );
  const last = pts[pts.length - 1];
  return (
    <View
      onLayout={
        fixedWidth === undefined
          ? (e) => setMeasured(Math.round(e.nativeEvent.layout.width))
          : undefined
      }
      style={{ height, width: fixedWidth }}
      testID={testID}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {width > 0 && path ? (
        <Canvas style={{ width, height }}>
          <Path
            path={path}
            color={t.colors[color]}
            style="stroke"
            strokeWidth={t.sizes.iconStrokeBold}
            strokeCap="round"
            strokeJoin="round"
          />
          {last ? <Circle cx={last.x} cy={last.y} r={dot} color={t.colors.accent} /> : null}
        </Canvas>
      ) : null}
    </View>
  );
});
