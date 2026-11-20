import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

/**
 * One water glass, everywhere (UI audit P2-6): a rounded glass that fills from the bottom with
 * the accent on the shared spring. 'small' sits in the Today / Eat WaterCard row, 'large' on the
 * water screen. Decorative: the card / screen speaks the total.
 */
export function Glass({
  full,
  index,
  size = 'small',
}: {
  full: boolean;
  index: number;
  size?: 'small' | 'large';
}) {
  const t = useTheme();
  const reduce = useReducedMotion();
  const s = useSharedValue(full ? 1 : 0);
  useEffect(() => {
    s.set(reduce ? (full ? 1 : 0) : withSpring(full ? 1 : 0, t.motion.spring));
  }, [full, reduce, s, t.motion.spring]);
  const fill = useAnimatedStyle(() => ({ transform: [{ scaleY: s.value }] }));
  const large = size === 'large';
  return (
    <View
      testID={`glass-${index}`}
      style={{
        width: large ? t.spacing.xxxl - t.spacing.xxs : t.spacing.md,
        height: large ? t.spacing.huge : t.spacing.xl,
        borderRadius: large ? t.radius.button : t.spacing.xxs,
        borderWidth: t.sizes.borderThick,
        borderColor: full ? t.colors.accent : t.colors.borderStrong,
        overflow: 'hidden',
        justifyContent: 'flex-end',
      }}
    >
      <Animated.View
        style={[
          { height: '100%', backgroundColor: t.colors.accent, transformOrigin: 'bottom' },
          fill,
        ]}
      />
    </View>
  );
}
