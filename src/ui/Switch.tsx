import { useEffect } from 'react';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

import { PressableScale } from './PressableScale';

export type SwitchTrackProps = { value: boolean; testID?: string };

/**
 * Visual-only switch (hidden from screen readers) for rows that are themselves the switch
 * (ToggleRow). Off: surface2 track with a borderStrong outline and thumb (≥ 3:1). On: accent
 * track with an onAccent thumb (8:1).
 */
export function SwitchTrack({ value, testID }: SwitchTrackProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const on = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    const to = value ? 1 : 0;
    on.set(reduceMotion ? to : withSpring(to, t.motion.spring));
  }, [value, on, reduceMotion, t.motion.spring]);

  const trackW = t.sizes.touch + t.spacing.xxs;
  const trackH = t.spacing.xxl;
  const border = t.sizes.borderThick;
  const thumbOn = trackH - border * 2 - t.spacing.xxs;
  const travel = trackW - border * 2 - t.spacing.xxs - thumbOn;

  const off = t.colors.surface2;
  const onC = t.colors.accent;
  const outlineOff = t.colors.borderStrong;
  const thumbOffC = t.colors.borderStrong;
  const thumbOnC = t.colors.onAccent;

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [off, onC]),
    borderColor: interpolateColor(on.value, [0, 1], [outlineOff, onC]),
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [thumbOffC, thumbOnC]),
    transform: [{ translateX: on.value * travel }, { scale: 0.75 + on.value * 0.25 }],
  }));

  return (
    <Animated.View
      testID={testID}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[
        {
          width: trackW,
          height: trackH,
          borderRadius: t.radius.pill,
          borderWidth: border,
          padding: t.spacing.xxs / 2,
          justifyContent: 'center',
        },
        trackStyle,
      ]}
    >
      <Animated.View
        style={[{ width: thumbOn, height: thumbOn, borderRadius: t.radius.pill }, thumbStyle]}
      />
    </Animated.View>
  );
}

export type SwitchProps = {
  value: boolean;
  onValueChange: (next: boolean) => void;
  /** Spoken name, e.g. "Rest timer sound". Required. */
  accessibilityLabel: string;
  disabled?: boolean;
  testID?: string;
};

/** Standalone on/off control with a 48dp target and a selection haptic on commit. */
export function Switch({
  value,
  onValueChange,
  accessibilityLabel,
  disabled,
  testID,
}: SwitchProps) {
  const t = useTheme();
  return (
    <PressableScale
      testID={testID}
      feedback="selection"
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: Boolean(disabled) }}
      style={{
        minWidth: t.sizes.touch,
        minHeight: t.sizes.touch,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <SwitchTrack value={value} testID={testID ? `${testID}-track` : undefined} />
    </PressableScale>
  );
}
