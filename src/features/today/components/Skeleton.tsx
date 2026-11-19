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

/** Shimmer block (sheet 11: skeletons, never spinners). Hidden from screen readers. */
export function SkeletonBlock({
  width = '100%',
  height,
  radius,
}: {
  width?: DimensionValue;
  height: number;
  radius?: number;
}) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) return;
    pulse.set(withRepeat(withTiming(0.5, { duration: t.motion.duration.slow * 3 }), -1, true));
  }, [pulse, reduceMotion, t.motion.duration.slow]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[
        { width, height, borderRadius: radius ?? t.radius.button, backgroundColor: t.colors.surface2 },
        style,
      ]}
    />
  );
}

/** Today while the first snapshot or the catalogue loads. */
export function TodaySkeleton({ testID = 'today-skeleton' }: { testID?: string }) {
  const t = useTheme();
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel="Loading today"
      style={{ gap: t.spacing.md }}
    >
      <SkeletonBlock height={t.sizes.button * 2} radius={t.radius.card} />
      <SkeletonBlock height={t.sizes.ring + t.spacing.card * 2} radius={t.radius.card} />
      <SkeletonBlock height={t.sizes.button * 3} radius={t.radius.card} />
    </View>
  );
}

/** Meal rows while recipe names load. */
export function MealsSkeleton({ rows = 3 }: { rows?: number }) {
  const t = useTheme();
  return (
    <View testID="meals-skeleton" style={{ gap: t.spacing.sm }}>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonBlock key={i} height={t.sizes.row} />
      ))}
    </View>
  );
}
