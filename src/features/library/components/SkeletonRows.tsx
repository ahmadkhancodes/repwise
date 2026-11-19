import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

/** Shimmer placeholder rows (sheet 11: skeletons, never spinners). */
export function SkeletonRows({ count = 8, testID }: { count?: number; testID?: string }) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) return;
    pulse.set(withRepeat(withTiming(0.5, { duration: t.motion.duration.slow * 3 }), -1, true));
  }, [pulse, reduceMotion, t.motion.duration.slow]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const block = { backgroundColor: t.colors.surface, borderRadius: t.radius.button };
  return (
    <Animated.View
      testID={testID}
      accessibilityLabel="Loading exercises"
      accessibilityRole="progressbar"
      style={[{ gap: t.spacing.md }, style]}
    >
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
          <View style={[block, { width: t.sizes.row, height: t.sizes.row }]} />
          <View style={{ flex: 1, gap: t.spacing.xs }}>
            <View style={[block, { height: t.spacing.md, width: `${70 - (i % 3) * 12}%` }]} />
            <View style={[block, { height: t.spacing.sm, width: '40%' }]} />
          </View>
        </View>
      ))}
    </Animated.View>
  );
}
