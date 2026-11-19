import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { useTheme } from '@/theme';

function Segment({ on }: { on: boolean }) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const fill = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    fill.set(reduceMotion ? (on ? 1 : 0) : withSpring(on ? 1 : 0, t.motion.spring));
  }, [on, fill, reduceMotion, t.motion.spring]);
  const style = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  return (
    <View style={{ flex: 1, height: t.spacing.xxs, borderRadius: t.radius.pill, backgroundColor: t.colors.surface2, overflow: 'hidden' }}>
      <Animated.View style={[{ height: '100%', backgroundColor: t.colors.textPrimary }, style]} />
    </View>
  );
}

/** Uber "ride progress" bar: thin segments, filled up to the current step. */
export function StepBar({ count, current }: { count: number; current: number }) {
  const t = useTheme();
  return (
    <View
      testID="checkin-progress"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${current + 1} of ${count}`}
      accessibilityValue={{ min: 1, max: count, now: current + 1 }}
      style={{ flexDirection: 'row', gap: t.spacing.xxs }}
    >
      {Array.from({ length: count }, (_, i) => (
        <Segment key={i} on={i <= current} />
      ))}
    </View>
  );
}
