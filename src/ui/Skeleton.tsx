import { useEffect, useState, type ReactNode } from 'react';
import { View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme, type TypeVariant } from '@/theme';

/** One shimmer sweep across a block (ms). Calm, not flashy. */
const SWEEP_MS = 1200;

export type SkeletonProps = {
  height: number;
  width?: DimensionValue;
  /** Defaults to radius.button (use radius.card for card blocks, radius.pill for avatars). */
  radius?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Shimmer block (sheet 11: "skeletons, not spinners"). A soft band sweeps across a surface2
 * block; static when Reduce Motion is on. Always hidden from screen readers — wrap a group in
 * SkeletonGroup to announce "Loading" once.
 */
export function Skeleton({ height, width = '100%', radius, style, testID }: SkeletonProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const [w, setW] = useState(0);
  const x = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion || w === 0) return;
    x.set(0);
    x.set(withRepeat(withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) }), -1));
  }, [reduceMotion, w, x]);

  const band = Math.max(t.spacing.xxxl, w * 0.4);
  const bandStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -band + x.value * (w + band) }],
  }));

  return (
    <View
      testID={testID}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[
        {
          height,
          width,
          borderRadius: radius ?? t.radius.button,
          backgroundColor: t.colors.surface2,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {reduceMotion || w === 0 ? null : (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: 0,
              bottom: 0,
              width: band,
              backgroundColor: t.colors.surface,
              opacity: 0.7,
            },
            bandStyle,
          ]}
        />
      )}
    </View>
  );
}

export type SkeletonTextProps = {
  lines?: number;
  /** Matches the real text's type step so the layout does not jump when content lands. */
  variant?: TypeVariant;
  /** Width of the last line (shorter reads as a paragraph). */
  lastLineWidth?: DimensionValue;
  testID?: string;
};

/** Text placeholder: bars at the variant's cap height, spaced at its line height. */
export function SkeletonText({
  lines = 2,
  variant = 'body',
  lastLineWidth = '60%',
  testID,
}: SkeletonTextProps) {
  const t = useTheme();
  const type = t.typography[variant];
  const bar = Math.round(type.fontSize * 0.75);
  return (
    <View testID={testID} style={{ gap: type.lineHeight - bar }}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          height={bar}
          radius={t.radius.pill}
          width={i === lines - 1 && lines > 1 ? lastLineWidth : '100%'}
        />
      ))}
    </View>
  );
}

export type SkeletonCardProps = {
  /** Text lines under the title bar. */
  lines?: number;
  /** Leading square media (meal photo, exercise thumb). */
  media?: boolean;
  /** Extra fixed-height body block (a chart, a ring row). */
  bodyHeight?: number;
  testID?: string;
};

/** Card-shaped placeholder that matches Card padding and radius. */
export function SkeletonCard({ lines = 2, media = false, bodyHeight, testID }: SkeletonCardProps) {
  const t = useTheme();
  return (
    <View
      testID={testID}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{
        backgroundColor: t.colors.surface,
        borderRadius: t.radius.card,
        padding: t.spacing.card,
        gap: t.spacing.sm,
      }}
    >
      <View style={{ flexDirection: 'row', gap: t.spacing.sm, alignItems: 'center' }}>
        {media ? <Skeleton height={t.sizes.hitGymLarge} width={t.sizes.hitGymLarge} /> : null}
        <View style={{ flex: 1, gap: t.spacing.xs }}>
          <Skeleton height={t.typography.headline.fontSize} width="55%" radius={t.radius.pill} />
          {lines > 0 ? <SkeletonText lines={lines} variant="callout" /> : null}
        </View>
      </View>
      {bodyHeight ? <Skeleton height={bodyHeight} radius={t.radius.card} /> : null}
    </View>
  );
}

export type SkeletonGroupProps = {
  /** Spoken once for the whole group, e.g. "Loading meals". */
  label?: string;
  children: ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/** Wraps skeletons so screen readers hear one busy "Loading" instead of nothing. */
export function SkeletonGroup({ label = 'Loading', children, testID, style }: SkeletonGroupProps) {
  const t = useTheme();
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      style={[{ gap: t.spacing.sm }, style]}
    >
      {children}
    </View>
  );
}
