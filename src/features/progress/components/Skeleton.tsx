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

/** Calm shimmer block (sheet 11: skeletons, never spinners). */
export function SkeletonBlock({
  height,
  width = '100%',
  radius,
  testID,
}: {
  height: number;
  width?: DimensionValue;
  radius?: number;
  testID?: string;
}) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) return;
    pulse.set(withRepeat(withTiming(0.55, { duration: t.motion.duration.slow * 3 }), -1, true));
  }, [pulse, reduceMotion, t.motion.duration.slow]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View
      testID={testID}
      style={[
        { height, width, borderRadius: radius ?? t.radius.card, backgroundColor: t.colors.surface },
        style,
      ]}
    />
  );
}

/** Screen-level skeleton: a hero number, a chart and a few rows. */
export function ProgressSkeleton({ testID = 'progress-skeleton' }: { testID?: string }) {
  const t = useTheme();
  return (
    <View testID={testID} accessible accessibilityLabel="Loading" style={{ gap: t.spacing.md }}>
      <SkeletonBlock
        height={t.typography.display.lineHeight}
        width="45%"
        radius={t.radius.button}
      />
      <SkeletonBlock height={200} />
      <SkeletonBlock height={t.sizes.row} />
      <SkeletonBlock height={t.sizes.row} />
    </View>
  );
}
