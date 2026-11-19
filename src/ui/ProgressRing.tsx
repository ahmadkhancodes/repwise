import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { useEffect, useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { useTheme, type ColorToken } from '@/theme';

/** Clamp to 0..1; NaN/Infinity → 0. Pure. */
export function clampProgress(p: number): number {
  if (!Number.isFinite(p)) return 0;
  return Math.min(1, Math.max(0, p));
}

export type ProgressRingProps = {
  /** 0..1 */
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: ColorToken;
  /** Spoken name, e.g. "Calories". */
  accessibilityLabel: string;
  /** Centre content, e.g. a BigNumber or a caption. */
  children?: ReactNode;
  testID?: string;
};

/** Skia ring (kcal, macros, workout progress). Animates with the shared spring. */
export function ProgressRing({
  progress,
  size,
  strokeWidth,
  color = 'accent',
  accessibilityLabel,
  children,
  testID,
}: ProgressRingProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const dim = size ?? t.sizes.ring;
  const stroke = strokeWidth ?? t.sizes.ringStroke;
  const value = clampProgress(progress);
  const end = useSharedValue(reduceMotion ? value : 0);

  useEffect(() => {
    end.set(reduceMotion ? value : withSpring(value, t.motion.spring));
  }, [value, reduceMotion, end, t.motion.spring]);

  const path = useMemo(() => {
    const r = (dim - stroke) / 2;
    // Start at 12 o'clock and go clockwise.
    return Skia.PathBuilder.Make()
      .addArc({ x: stroke / 2, y: stroke / 2, width: r * 2, height: r * 2 }, -90, 359.9)
      .build();
  }, [dim, stroke]);

  const percent = Math.round(value * 100);

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: percent, text: `${percent}%` }}
      style={{ width: dim, height: dim, alignItems: 'center', justifyContent: 'center' }}
    >
      <Canvas style={{ position: 'absolute', width: dim, height: dim }}>
        <Path
          path={path}
          style="stroke"
          strokeWidth={stroke}
          strokeCap="round"
          color={t.colors.surface2}
        />
        <Path
          path={path}
          style="stroke"
          strokeWidth={stroke}
          strokeCap="round"
          color={t.colors[color]}
          start={0}
          end={end}
        />
      </Canvas>
      {children}
    </View>
  );
}
