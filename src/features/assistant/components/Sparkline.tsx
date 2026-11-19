import { View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { useTheme } from '@/theme';

import { pointsAttr, sparkPoints } from '../logic/spark';

/** Weight-trend sparkline (7-day averages). Decorative; the numbers beside it are spoken. */
export function Sparkline({ values, width, height }: { values: number[]; width: number; height: number }) {
  const t = useTheme();
  const stroke = t.sizes.iconStroke + 1;
  const pts = sparkPoints(values, width, height, stroke * 2);
  const last = pts[pts.length - 1];
  return (
    <View
      testID="sparkline"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ width, height }}
    >
      {pts.length > 1 ? (
        <Svg width={width} height={height}>
          <Polyline
            points={pointsAttr(pts)}
            fill="none"
            stroke={t.colors.textPrimary}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {last ? <Circle cx={last.x} cy={last.y} r={stroke * 1.5} fill={t.colors.accent} /> : null}
        </Svg>
      ) : null}
    </View>
  );
}
