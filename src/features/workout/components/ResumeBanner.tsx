import { router } from 'expo-router';
import { Play } from 'lucide-react-native';
import { View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { PressableScale, Text } from '@/ui';

import { pausedSince } from '../actions';
import { useActiveSession } from '../hooks/useTrain';
import { useNow } from '../hooks/useNow';
import { activeMs, formatClock } from '../logic/duration';

/**
 * "Workout in progress" card (F2 edge case: app killed mid-workout → resume banner).
 * Renders nothing when no workout is running. Exported for Today.
 */
export function ResumeBanner({ testID = 'resume-banner' }: { testID?: string }) {
  const t = useTheme();
  const { data: s } = useActiveSession();
  const now = useNow(1000, !!s && s.status === 'active');
  // Reduced motion (Android "Remove animations"): no entering animation. On device it could
  // leave the banner invisible after a cold start (Maestro workout/03).
  const reduceMotion = useReducedMotion();
  if (!s) return null;
  const paused = s.status === 'paused';
  const clock = formatClock(activeMs(s, now, paused ? pausedSince(s.id) : null));
  return (
    <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(t.motion.duration.base)}>
      <PressableScale
        onPress={() => router.push(`/workout/${s.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`${s.title ?? 'Workout'} in progress, ${clock}. Resume`}
        testID={testID}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm,
          padding: t.spacing.card,
          borderRadius: t.radius.card,
          backgroundColor: t.colors.accentSoft,
          minHeight: t.sizes.touch,
        }}
      >
        <View
          style={{
            width: t.sizes.touch,
            height: t.sizes.touch,
            borderRadius: t.radius.pill,
            backgroundColor: t.colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Play color={t.colors.onAccent} size={t.sizes.icon} strokeWidth={t.sizes.iconStroke} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="headline" numberOfLines={1}>
            {paused ? 'Workout paused' : 'Workout in progress'}
          </Text>
          <Text variant="callout" color="textSecondary" tabular numberOfLines={1}>
            {s.title ?? 'Workout'} · {clock}
          </Text>
        </View>
        <Text variant="headline" color="accentText">
          Resume
        </Text>
      </PressableScale>
    </Animated.View>
  );
}
