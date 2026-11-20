import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { enterAt } from './listMotion';

/**
 * Wrapper for the shared card / row entrance (`enterAt`: 20 ms stagger capped at one screenful,
 * nothing under Reduce Motion). Replaces the per-feature stagger helpers (UI audit P2-7).
 */
export function Enter({
  index,
  children,
  style,
  testID,
}: {
  index: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <Animated.View entering={enterAt(index, reduce)} style={style} testID={testID}>
      {children}
    </Animated.View>
  );
}
