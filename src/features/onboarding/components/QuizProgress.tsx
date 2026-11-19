import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

type Props = {
  /** Number of segments (visible quiz steps). */
  total: number;
  /** 0-based index of the current step. */
  index: number;
  testID?: string;
};

/**
 * Uber "trip progress" bar (sheet 11): thin segments, done ones filled, the current one fills with
 * the shared spring when the step opens, so moving between steps feels continuous.
 */
export function QuizProgress({ total, index, testID }: Props) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const fill = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    fill.set(reduceMotion ? 1 : withSpring(1, t.motion.spring));
  }, [index, fill, reduceMotion, t.motion.spring]);

  const current = useAnimatedStyle(() => ({ width: `${Math.round(fill.value * 100)}%` }));
  const height = t.spacing.xxs;

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Quiz progress"
      accessibilityValue={{
        min: 0,
        max: total,
        now: index + 1,
        text: `Step ${index + 1} of ${total}`,
      }}
      style={{ flexDirection: 'row', gap: t.spacing.xxs, paddingHorizontal: t.spacing.screen }}
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height,
            borderRadius: t.radius.pill,
            backgroundColor: t.colors.surface2,
            overflow: 'hidden',
          }}
        >
          {i < index ? (
            <View style={{ flex: 1, backgroundColor: t.colors.textPrimary }} />
          ) : i === index ? (
            <Animated.View style={[{ height, backgroundColor: t.colors.accent }, current]} />
          ) : null}
        </View>
      ))}
    </View>
  );
}
