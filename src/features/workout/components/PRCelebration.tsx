import { Trophy } from 'lucide-react-native';
import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, { FadeOut, ZoomIn } from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { Text } from '@/ui';

import { Confetti } from './Confetti';
import { useMotionSafe } from '@/ui/motion';

export type PRMoment = {
  /** Unique per celebration (the set id), so a second PR replays it. */
  key: string;
  exercise: string;
  /** Hero number, e.g. "102.5". */
  value: string;
  unit: string;
  reps: number;
  kind: 'weight' | 'e1rm';
};

/** How long the PR moment stays on screen. */
export const PR_MOMENT_MS = 2600;

/**
 * W3 PR moment, live in the player: a confetti burst and the new best as a hero number over the
 * workout. Never blocks a tap (pointerEvents none) and clears itself; Reduce Motion keeps only
 * the card. Spoken once for screen readers.
 */
export function PRCelebration({ moment, onDone }: { moment: PRMoment | null; onDone: () => void }) {
  const t = useTheme();
  const safe = useMotionSafe();
  useEffect(() => {
    if (!moment) return;
    AccessibilityInfo.announceForAccessibility(
      `New personal record. ${moment.exercise}, ${moment.value} ${moment.unit} for ${moment.reps}`,
    );
    const id = setTimeout(onDone, PR_MOMENT_MS);
    return () => clearTimeout(id);
  }, [moment, onDone]);
  if (!moment) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="pr-moment">
      <Confetti key={moment.key} play />
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: t.spacing.screen,
        }}
      >
        <Animated.View
          entering={safe(ZoomIn.springify()
            .damping(t.motion.spring.damping)
            .stiffness(t.motion.spring.stiffness))}
          exiting={safe(FadeOut.duration(t.motion.duration.base))}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={{
            alignItems: 'center',
            gap: t.spacing.xs,
            paddingVertical: t.spacing.lg,
            paddingHorizontal: t.spacing.xl,
            borderRadius: t.radius.sheet,
            backgroundColor: t.colors.inverse,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}>
            <Trophy
              color={t.colors.accentOnInverse}
              size={t.sizes.iconMedium}
              strokeWidth={t.sizes.iconStrokeBold}
            />
            <Text variant="headline" style={{ color: t.colors.accentOnInverse }}>
              New PR
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: t.spacing.xxs }}>
            <Text
              variant="hero"
              tabular
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ color: t.colors.onInverse }}
              testID="pr-moment-value"
            >
              {moment.value}
            </Text>
            <Text variant="title2" style={{ color: t.colors.onInverse }}>
              {moment.unit}
            </Text>
          </View>
          <Text variant="headline" style={{ color: t.colors.onInverse }} numberOfLines={1}>
            {moment.exercise} · × {moment.reps}
            {moment.kind === 'e1rm' ? ' · best set' : ''}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}
