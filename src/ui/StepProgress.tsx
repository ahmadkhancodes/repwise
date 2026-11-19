import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useTheme, type ColorToken } from '@/theme';

import { clampProgress } from './ProgressRing';

/**
 * Fill (0..1) of each segment. With `fractions`, those win (workout: one segment per exercise).
 * Otherwise steps before `current` are full, `current` is full (it fills as it opens), later
 * ones are empty. Pure.
 */
export function segmentFills(
  total: number,
  current: number,
  fractions?: readonly number[],
): number[] {
  if (fractions) return fractions.map(clampProgress);
  const n = Math.max(0, Math.floor(total));
  return Array.from({ length: n }, (_, i) => (i <= current ? 1 : 0));
}

function Segment({ fill, color }: { fill: number; color: ColorToken }) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const w = useSharedValue(reduceMotion ? fill : 0);
  useEffect(() => {
    w.set(reduceMotion ? fill : withSpring(fill, t.motion.spring));
  }, [fill, reduceMotion, w, t.motion.spring]);
  const style = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, w.value)) * 100}%` }));
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
      <Animated.View style={[{ height: '100%', backgroundColor: t.colors[color] }, style]} />
    </View>
  );
}

export type StepProgressProps = {
  /** Number of steps (ignored when `fractions` is given). */
  total?: number;
  /** 0-based current step. */
  current?: number;
  /** Per-segment fill 0..1 (e.g. sets done per exercise). */
  fractions?: readonly number[];
  /** Spoken name, e.g. "Quiz progress", "Workout progress". */
  accessibilityLabel: string;
  /** Fill colour: textPrimary (Uber black/white, default) or accent (workout). */
  color?: Extract<ColorToken, 'textPrimary' | 'accent'>;
  testID?: string;
};

/** Uber "trip progress" bar (sheet 11): thin segments filling with the shared spring. */
export function StepProgress({
  total = 0,
  current = 0,
  fractions,
  accessibilityLabel,
  color = 'textPrimary',
  testID,
}: StepProgressProps) {
  const t = useTheme();
  const fills = segmentFills(total, current, fractions);
  const value = fractions
    ? {
        min: 0,
        max: 100,
        now: fills.length ? Math.round((fills.reduce((a, f) => a + f, 0) / fills.length) * 100) : 0,
      }
    : { min: 1, max: fills.length, now: Math.min(fills.length, current + 1) };
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={
        fractions
          ? { ...value, text: `${value.now}%` }
          : { ...value, text: `Step ${value.now} of ${value.max}` }
      }
      style={{ flexDirection: 'row', gap: t.spacing.xxs }}
    >
      {fills.map((f, i) => (
        <Segment key={i} fill={f} color={color} />
      ))}
    </View>
  );
}
