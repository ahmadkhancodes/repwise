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

/** Soft pulsing block (sheet 11: skeletons, not spinners). Static when Reduce Motion is on. */
export function SkeletonBlock({ height, width = '100%' }: { height: number; width?: DimensionValue }) {
  const t = useTheme();
  const reduce = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (!reduce) o.set(withRepeat(withTiming(0.55, { duration: t.motion.duration.slow * 3 }), -1, true));
  }, [o, reduce, t.motion.duration.slow]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      style={[{ height, width, borderRadius: t.radius.card, backgroundColor: t.colors.surface }, style]}
    />
  );
}

/** Placeholder for a list of cards while the catalogue loads. */
export function SkeletonList({ count = 3, testID }: { count?: number; testID?: string }) {
  const t = useTheme();
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel="Loading"
      accessibilityState={{ busy: true }}
      style={{ gap: t.spacing.sm }}
    >
      <SkeletonBlock height={t.sizes.touch} width="60%" />
      {Array.from({ length: count }, (_, i) => (
        <SkeletonBlock key={i} height={t.sizes.button * 2} />
      ))}
    </View>
  );
}
