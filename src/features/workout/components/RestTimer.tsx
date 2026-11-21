import { Pause, Play, Plus, SkipForward } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeOutDown,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme, type Theme } from '@/theme';
import {
  BigTimer,
  Button,
  FINAL_SECONDS,
  fitFontSize,
  formatCountdown,
  PressableScale,
  Sheet,
  spokenCountdown,
  Text,
} from '@/ui';

import { useRestCountdown } from '../hooks/useRestTimer';
import { REST_STEP_S, remainingMs, type RestTimerState } from '../logic/restTimer';
import { restTimer } from '../restTimerStore';
import { useMotionSafe } from '@/ui/motion';

/** "Next: Bench press · set 3 · 80 kg × 8". */
export function nextLine(state: RestTimerState): string | undefined {
  if (state.status === 'idle' || !state.next) return undefined;
  const n = state.next;
  return [`Next: ${n.exercise}`, `set ${n.setNo}`, n.detail].filter(Boolean).join(' · ');
}

/**
 * Remaining-rest bar driven on the UI thread (A9): one linear timing per start/±15/pause, so it
 * drains at 60/120 fps with zero JS work per frame.
 */
function DrainBar({ state }: { state: RestTimerState }) {
  const t = useTheme();
  const reduce = useReducedMotion();
  const fill = useSharedValue(1);
  useEffect(() => {
    if (state.status === 'idle' || state.durationMs <= 0) return;
    const left = remainingMs(state, Date.now());
    fill.set(left / state.durationMs);
    if (state.status === 'running' && !reduce) {
      fill.set(withTiming(0, { duration: left, easing: Easing.linear }));
    }
    return () => cancelAnimation(fill);
  }, [state, reduce, fill]);
  // Transform only (perf N8): scaleX from the left edge never triggers a layout pass.
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleX: Math.max(0, Math.min(1, fill.value)) }],
  }));
  return (
    <View style={{ height: t.spacing.xxs, borderRadius: t.radius.pill, overflow: 'hidden' }}>
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: t.colors.onInverse, opacity: 0.25 }]}
      />
      <Animated.View
        testID="rest-bar-fill"
        style={[
          {
            height: '100%',
            width: '100%',
            transformOrigin: 'left',
            backgroundColor: t.colors.accentOnInverse,
          },
          style,
        ]}
      />
    </View>
  );
}

/** Width left for the countdown in the rest bar on a `windowWidth` screen. Pure. */
export function restBarTimeBox(windowWidth: number, t: Pick<Theme, 'spacing' | 'sizes'>): number {
  return Math.max(
    0,
    windowWidth - t.spacing.screen * 2 - t.spacing.sm * 2 - t.sizes.hitGym * 2 - t.spacing.sm * 2,
  );
}

/**
 * Rest-bar countdown size (perf N21): the BigTimer hero size, glanceable at 1 m, shrunk only as
 * far as the box needs so "10:00" never clips at 360dp / 130% font. Sized for the widest
 * minute-width of the current text so the digits never jump size mid-countdown. Pure.
 */
export function restBarTimeSize(
  text: string,
  box: number,
  fontScale: number,
  t: Pick<Theme, 'typography'>,
): number {
  const hero = t.typography.hero;
  return fitFontSize({
    text: text.replace(/\d/g, '0'),
    maxWidth: box,
    fontSize: hero.fontSize,
    fontScale,
    maxMultiplier: hero.maxFontSizeMultiplier,
    letterSpacing: hero.letterSpacing,
  });
}

/**
 * Rest bar in the player footer (B4): full width, inverse, the countdown at display size, who is
 * next, and +15 / Skip as 56dp buttons. The countdown is hero-size (N21), all reachable without opening anything. Only this leaf
 * ticks (1 Hz). Tap the time for the hero timer.
 */
export function RestBar({ onOpen }: { onOpen: () => void }) {
  const t = useTheme();
  const safe = useMotionSafe();
  const { width, fontScale } = useWindowDimensions();
  const view = useRestCountdown();
  // Until the first layout, assume the 360dp worst case: bar padding and the two 56dp controls.
  const [timeBox, setTimeBox] = useState(() => restBarTimeBox(width, t));
  const hero = t.typography.hero;
  if (view.state.status === 'idle') return null;
  const paused = view.state.status === 'paused';
  const text = formatCountdown(view.remainingMs);
  const s = Math.ceil(view.remainingMs / 1000);
  const ending = !paused && s > 0 && s <= FINAL_SECONDS;
  const next = nextLine(view.state);
  const timeSize = restBarTimeSize(text, timeBox, fontScale, t);
  const btn = {
    minWidth: t.sizes.hitGym,
    minHeight: t.sizes.hitGym,
    borderRadius: t.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: t.spacing.sm,
    borderWidth: t.sizes.hairline,
    borderColor: t.colors.onInverse,
  } as const;
  return (
    <Animated.View
      entering={safe(FadeInDown.springify()
        .damping(t.motion.spring.damping)
        .stiffness(t.motion.spring.stiffness))}
      exiting={safe(FadeOutDown.duration(t.motion.duration.fast))}
      testID="rest-bar"
      style={{
        backgroundColor: t.colors.inverse,
        borderRadius: t.radius.card,
        padding: t.spacing.sm,
        gap: t.spacing.xs,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
        <PressableScale
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={`Rest ${paused ? 'paused' : 'timer'}, ${spokenCountdown(view.remainingMs)} left${next ? `. ${next}` : ''}`}
          accessibilityHint="Opens the big rest timer"
          testID="rest-bar-open"
          onLayout={(e) => setTimeBox(e.nativeEvent.layout.width)}
          style={{ flex: 1, minHeight: t.sizes.hitGym, justifyContent: 'center' }}
        >
          <Text
            variant="hero"
            allowFontScaling={false}
            numberOfLines={1}
            style={{
              color: ending ? t.colors.accentOnInverse : t.colors.onInverse,
              fontSize: timeSize,
              lineHeight: Math.ceil(hero.lineHeight * (timeSize / hero.fontSize)),
              letterSpacing: (hero.letterSpacing ?? 0) * (timeSize / hero.fontSize),
            }}
            testID="rest-bar-time"
          >
            {text}
          </Text>
          <Text variant="callout" numberOfLines={1} style={{ color: t.colors.onInverse }}>
            {paused ? 'Paused' : (next ?? 'Rest')}
          </Text>
        </PressableScale>
        <PressableScale
          feedback="light"
          onPress={() => restTimer.add(REST_STEP_S)}
          accessibilityRole="button"
          accessibilityLabel={`Add ${REST_STEP_S} seconds`}
          testID="rest-bar-plus"
          style={btn}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Plus
              color={t.colors.onInverse}
              size={t.sizes.iconSmall}
              strokeWidth={t.sizes.iconStrokeBold}
            />
            <Text variant="headline" tabular style={{ color: t.colors.onInverse }}>
              {REST_STEP_S}
            </Text>
          </View>
        </PressableScale>
        <PressableScale
          feedback="light"
          onPress={() => restTimer.skip()}
          accessibilityRole="button"
          accessibilityLabel="Skip rest"
          testID="rest-bar-skip"
          style={{ ...btn, backgroundColor: t.colors.onInverse }}
        >
          <SkipForward
            color={t.colors.inverse}
            size={t.sizes.icon}
            strokeWidth={t.sizes.iconStroke}
          />
        </PressableScale>
      </View>
      <DrainBar state={view.state} />
    </Animated.View>
  );
}

/** Hero rest timer (sheet 11 Timer): the shared BigTimer (hero number, −15 / +15 / Skip) + pause. */
export function RestTimerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTheme();
  const view = useRestCountdown();
  const st = view.state;
  const active = st.status !== 'idle';
  const paused = st.status === 'paused';
  return (
    <Sheet open={open && active} onClose={onClose} title="Rest" testID="rest-sheet">
      {open && active ? (
        <View style={{ alignItems: 'center', gap: t.spacing.md }}>
          <BigTimer
            remainingMs={view.remainingMs}
            totalMs={st.durationMs}
            onAdjust={(d) => restTimer.add(d)}
            onSkip={() => {
              restTimer.skip();
              onClose();
            }}
            caption={paused ? 'Paused' : undefined}
            next={nextLine(st)}
            testID="rest"
          />
          <Button
            label={paused ? 'Resume rest' : 'Pause rest'}
            icon={paused ? Play : Pause}
            variant="tertiary"
            onPress={() => (paused ? restTimer.resume() : restTimer.pause())}
            testID="rest-pause"
            style={{ alignSelf: 'stretch' }}
          />
        </View>
      ) : null}
    </Sheet>
  );
}
