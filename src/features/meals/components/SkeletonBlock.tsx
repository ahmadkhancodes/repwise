import { useEffect } from 'react';
import { View, type DimensionValue } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

type Props = { height: number; width?: DimensionValue; radius?: number };

/** Shimmer block (sheet 11: skeletons, never spinners). Static when Reduce Motion is on. */
export function SkeletonBlock({ height, width = '100%', radius }: Props) {
  const t = useTheme();
  const reduce = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (reduce) return;
    o.set(withRepeat(withTiming(0.5, { duration: t.motion.duration.slow * 3 }), -1, true));
  }, [o, reduce, t.motion.duration.slow]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      style={[
        { height, width, borderRadius: radius ?? t.radius.card, backgroundColor: t.colors.surface },
        style,
      ]}
    />
  );
}

/** Skeleton for a list of cards (Eat day, grocery, log). */
export function SkeletonList({ rows = 4, testID }: { rows?: number; testID?: string }) {
  const t = useTheme();
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
      style={{ gap: t.spacing.sm }}
    >
      <SkeletonBlock height={t.sizes.ring + t.spacing.xl} />
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonBlock key={i} height={t.sizes.row + t.spacing.xl} />
      ))}
    </View>
  );
}
