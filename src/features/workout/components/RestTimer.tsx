import { Pause, Play, Timer } from 'lucide-react-native';
import { View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { Button, PressableScale, ProgressRing, Sheet, Text } from '@/ui';

import type { RestTimerView } from '../hooks/useRestTimer';
import { formatCountdown } from '../logic/duration';
import { REST_STEP_S } from '../logic/restTimer';
import { restTimer } from '../restTimerStore';

/** Mini floating pill while resting (sheet 11 Timer): countdown + thin progress; tap for controls. */
export function RestTimerPill({ view, onPress }: { view: RestTimerView; onPress: () => void }) {
  const t = useTheme();
  if (view.state.status === 'idle') return null;
  const paused = view.state.status === 'paused';
  const text = formatCountdown(view.remainingMs);
  return (
    <Animated.View
      entering={FadeInDown.springify().damping(t.motion.spring.damping).stiffness(t.motion.spring.stiffness)}
      exiting={FadeOutDown.duration(t.motion.duration.fast)}
      style={{ alignItems: 'center' }}
    >
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Rest ${paused ? 'paused' : 'timer'}, ${text} left`}
        accessibilityHint="Opens rest timer controls"
        testID="rest-pill"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.xs,
          minHeight: t.sizes.touch,
          paddingHorizontal: t.spacing.md,
          borderRadius: t.radius.pill,
          backgroundColor: t.colors.inverse,
        }}
      >
        <Timer color={t.colors.onInverse} size={t.sizes.iconSmall + t.spacing.xxs} strokeWidth={t.sizes.iconStroke} />
        <Text variant="headline" tabular style={{ color: t.colors.onInverse }} testID="rest-pill-time">
          {text}
        </Text>
        <View
          style={{
            width: t.spacing.xxxl,
            height: t.spacing.xxs,
            borderRadius: t.radius.pill,
            backgroundColor: t.colors.textSecondary,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${Math.round(Math.min(1, Math.max(0, view.progress)) * 100)}%`,
              height: '100%',
              backgroundColor: t.colors.accent,
            }}
          />
        </View>
      </PressableScale>
    </Animated.View>
  );
}

/** Rest controls (sheet 11 Timer): big countdown, −15 / +15, pause, skip. */
export function RestTimerSheet({
  open,
  view,
  onClose,
}: {
  open: boolean;
  view: RestTimerView;
  onClose: () => void;
}) {
  const t = useTheme();
  const st = view.state;
  const active = st.status !== 'idle';
  const paused = st.status === 'paused';
  const text = formatCountdown(view.remainingMs);
  return (
    <Sheet open={open && active} onClose={onClose} title="Rest" testID="rest-sheet">
      {open && active ? (
        <View style={{ alignItems: 'center', gap: t.spacing.lg }}>
          <ProgressRing
            progress={1 - view.progress}
            size={t.sizes.ring * 1.6}
            strokeWidth={t.sizes.ringStroke}
            accessibilityLabel={`${text} of rest left`}
          >
            <Text variant="display" tabular testID="rest-sheet-time">
              {text}
            </Text>
            {paused ? (
              <Text variant="caption" color="textSecondary">
                Paused
              </Text>
            ) : null}
          </ProgressRing>
          {st.next ? (
            <Text variant="callout" color="textSecondary" align="center">
              Next: {st.next.exercise} · set {st.next.setNo}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: t.spacing.sm, alignSelf: 'stretch' }}>
            <Button
              label={`−${REST_STEP_S} s`}
              variant="secondary"
              accessibilityLabel={`Remove ${REST_STEP_S} seconds`}
              onPress={() => restTimer.add(-REST_STEP_S)}
              testID="rest-minus"
              style={{ flex: 1 }}
            />
            <Button
              label={paused ? 'Resume' : 'Pause'}
              icon={paused ? Play : Pause}
              variant="secondary"
              onPress={() => (paused ? restTimer.resume() : restTimer.pause())}
              testID="rest-pause"
              style={{ flex: 1 }}
            />
            <Button
              label={`+${REST_STEP_S} s`}
              variant="secondary"
              accessibilityLabel={`Add ${REST_STEP_S} seconds`}
              onPress={() => restTimer.add(REST_STEP_S)}
              testID="rest-plus"
              style={{ flex: 1 }}
            />
          </View>
          <Button
            label="Skip rest"
            onPress={() => {
              restTimer.skip();
              onClose();
            }}
            testID="rest-skip"
            style={{ alignSelf: 'stretch' }}
          />
        </View>
      ) : null}
    </Sheet>
  );
}
