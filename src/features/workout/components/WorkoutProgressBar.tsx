import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

function Segment({ fraction }: { fraction: number }) {
  const t = useTheme();
  const reduce = useReducedMotion();
  const w = useSharedValue(fraction);
  useEffect(() => {
    w.set(reduce ? fraction : withSpring(fraction, t.motion.spring));
  }, [fraction, reduce, w, t.motion.spring]);
  const fill = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, w.value)) * 100}%` }));
  return (
    <View
      style={{
        flex: 1,
        height: t.spacing.xxs,
        borderRadius: t.radius.pill,
        backgroundColor: t.colors.surface2,
        overflow: 'hidden',
      }}
    >
      <Animated.View style={[{ height: '100%', backgroundColor: t.colors.accent }, fill]} />
    </View>
  );
}

/** Uber trip-style progress: one thin segment per exercise, filling as sets are ticked. */
export function WorkoutProgressBar({ fractions, testID }: { fractions: number[]; testID?: string }) {
  const t = useTheme();
  const done = fractions.reduce((a, f) => a + f, 0);
  const pct = fractions.length ? Math.round((done / fractions.length) * 100) : 0;
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Workout progress"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={{ flexDirection: 'row', gap: t.spacing.xxs }}
    >
      {fractions.map((f, i) => (
        <Segment key={i} fraction={f} />
      ))}
    </View>
  );
}
