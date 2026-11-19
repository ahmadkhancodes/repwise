import { useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useTheme, type ColorToken } from '@/theme';

import { confettiParticles, type Particle } from '../logic/confetti';

const COLORS: ColorToken[] = ['accent', 'macroProtein', 'macroCarb', 'macroFat', 'textPrimary'];
const DURATION = 1400;

function Piece({ p, t, w, h, color }: { p: Particle; t: SharedValue<number>; w: number; h: number; color: string }) {
  const style = useAnimatedStyle(() => {
    const k = t.value;
    return {
      opacity: k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25,
      transform: [
        { translateX: p.x * w * 0.15 + p.drift * w * 0.35 * k },
        { translateY: -h * 0.05 + h * p.fall * k },
        { rotate: `${p.rotate * k}deg` },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: w / 2,
          top: 0,
          width: p.size,
          height: p.size * 0.5,
          borderRadius: 1,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

/** PR celebration (W3): one tasteful burst from the top, then gone. Nothing with Reduce Motion. */
export function Confetti({ play, count = 36 }: { play: boolean; count?: number }) {
  const t = useTheme();
  const reduce = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const progress = useSharedValue(0);
  const particles = useMemo(() => confettiParticles(count, COLORS.length), [count]);

  useEffect(() => {
    if (!play || reduce) return;
    progress.set(0);
    progress.set(withDelay(120, withTiming(1, { duration: DURATION, easing: Easing.out(Easing.quad) })));
  }, [play, reduce, progress]);

  if (!play || reduce) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="confetti" importantForAccessibility="no-hide-descendants">
      {particles.map((p, i) => (
        <Piece key={i} p={p} t={progress} w={width} h={height} color={t.colors[COLORS[p.colorIndex] ?? 'accent']} />
      ))}
    </View>
  );
}
