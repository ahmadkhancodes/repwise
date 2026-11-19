import type { ReactNode } from 'react';
import {
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { haptics } from '@/services/haptics';
import { useTheme } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  /**
   * 'light' (default) on taps, 'selection' on pickers, 'success' on a core action, 'none' to
   * skip (the handler owns its haptic). Fires on commit (press / long-press), never on press-in,
   * so a touch that starts a scroll never buzzes.
   */
  feedback?: 'light' | 'selection' | 'success' | 'none';
};

/**
 * Shared press behaviour: iOS scales to 0.98 with a spring; Android shows the
 * material ripple (bounded) instead. Visual feedback starts on press-in (< 100 ms budget);
 * the haptic fires only when the press commits (onPress / onLongPress).
 */
export function PressableScale({
  style,
  children,
  feedback = 'light',
  disabled,
  onPressIn,
  onPress,
  onLongPress,
  ...rest
}: PressableScaleProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const isIOS = Platform.OS === 'ios';

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      android_ripple={isIOS ? undefined : { color: t.colors.ripple, borderless: false }}
      onPress={
        onPress
          ? (e) => {
              if (feedback !== 'none') haptics[feedback]();
              onPress(e);
            }
          : undefined
      }
      onLongPress={
        onLongPress
          ? (e) => {
              if (feedback !== 'none') haptics[feedback]();
              onLongPress(e);
            }
          : undefined
      }
      onPressIn={(e) => {
        if (isIOS && !reduceMotion) scale.set(withSpring(t.motion.pressScale, t.motion.spring));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (isIOS) scale.set(withSpring(1, t.motion.spring));
        rest.onPressOut?.(e);
      }}
      style={[{ overflow: 'hidden' }, style, isIOS && animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}
