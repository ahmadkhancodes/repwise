import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { View } from 'react-native';

import { useTheme, type ColorToken } from '@/theme';

import { layoutLines, linePath } from '../logic/chart';

import { useChartSizes, useWidth } from './chartParts';

/**
 * Tiny static trend line for a home tile. No grid, no animation, no scrub: the path is built
 * once per data change, so the tile costs one draw.
 */
export const Sparkline = memo(function Sparkline({
  values,
  color = 'textPrimary',
  testID,
}: {
  values: readonly number[];
  color?: ColorToken;
  testID?: string;
}) {
  const t = useTheme();
  const c = useChartSizes();
  const [width, onLayout] = useWidth();
  const height = c.sparkHeight;
  const key = values.join(',');
  const pts = useMemo(() => {
    if (width <= 0 || values.length < 2) return [];
    const pad = c.endDot + t.sizes.hairline;
    return (
      layoutLines([values], {
        width,
        height,
        padTop: pad,
        padBottom: pad,
        padLeft: pad,
        padRight: pad,
      }).series[0] ?? []
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, width, height, c.endDot, t.sizes.hairline]);
  const path = useMemo(
    () => (pts.length > 1 ? (Skia.Path.MakeFromSVGString(linePath(pts)) ?? null) : null),
    [pts],
  );
  const last = pts[pts.length - 1];
  return (
    <View
      onLayout={onLayout}
      style={{ height }}
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
            strokeWidth={c.stroke}
            strokeCap="round"
            strokeJoin="round"
          />
          {last ? <Circle cx={last.x} cy={last.y} r={c.endDot} color={t.colors.accent} /> : null}
        </Canvas>
      ) : null}
    </View>
  );
});
