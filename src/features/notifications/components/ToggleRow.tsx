import type { LucideIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { PressableScale, Text } from '@/ui';

export type ToggleRowProps = {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Trailing badge instead of the switch, e.g. "Pro" (row then calls onLockedPress). */
  locked?: string;
  onLockedPress?: () => void;
  divider?: boolean;
  testID?: string;
};

const TRACK_W = 52;
const TRACK_H = 32;
const THUMB = 26;
const INSET = (TRACK_H - THUMB) / 2;

/**
 * Settings row with an animated switch (spring thumb, colour cross-fade). The whole row is the
 * 48dp+ target; role "switch" with its checked state for screen readers. Selection haptic.
 */
export function ToggleRow({
  title,
  subtitle,
  icon: Icon,
  value,
  onChange,
  disabled,
  locked,
  onLockedPress,
  divider = false,
  testID,
}: ToggleRowProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const on = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    const target = value ? 1 : 0;
    on.set(reduceMotion ? withTiming(target, { duration: 0 }) : withSpring(target, t.motion.spring));
  }, [value, on, reduceMotion, t.motion.spring]);

  const off = t.colors.surface2;
  const onColor = t.colors.accent;
  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [off, onColor]),
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: on.value * (TRACK_W - THUMB - INSET * 2) }],
  }));

  const label = [title, subtitle, locked].filter(Boolean).join(', ');
  const isLocked = Boolean(locked);

  return (
    <PressableScale
      testID={testID}
      feedback="selection"
      disabled={disabled}
      onPress={() => (isLocked ? onLockedPress?.() : onChange(!value))}
      accessibilityRole={isLocked ? 'button' : 'switch'}
      accessibilityLabel={label}
      accessibilityState={isLocked ? { disabled: Boolean(disabled) } : { checked: value, disabled: Boolean(disabled) }}
      style={{
        minHeight: t.sizes.row,
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.sm,
        paddingVertical: t.spacing.sm,
        borderBottomWidth: divider ? t.sizes.hairline : 0,
        borderBottomColor: t.colors.border,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {Icon ? <Icon color={t.colors.textPrimary} size={t.sizes.icon} strokeWidth={t.sizes.iconStroke} /> : null}
      <View style={{ flex: 1, gap: t.spacing.xxs }}>
        <Text variant="body">{title}</Text>
        {subtitle ? (
          <Text variant="callout" color="textSecondary" tabular>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {isLocked ? (
        <View
          style={{
            backgroundColor: t.colors.accentSoft,
            borderRadius: t.radius.pill,
            paddingHorizontal: t.spacing.xs,
            paddingVertical: t.spacing.xxs,
          }}
        >
          <Text variant="caption" color="accentText">
            {locked}
          </Text>
        </View>
      ) : (
        <Animated.View
          testID={testID ? `${testID}-track` : undefined}
          style={[{ width: TRACK_W, height: TRACK_H, borderRadius: t.radius.pill, padding: INSET }, trackStyle]}
        >
          <Animated.View
            style={[
              {
                width: THUMB,
                height: THUMB,
                borderRadius: t.radius.pill,
                backgroundColor: t.colors.bg,
                borderWidth: t.sizes.hairline,
                borderColor: t.colors.border,
              },
              thumbStyle,
            ]}
          />
        </Animated.View>
      )}
    </PressableScale>
  );
}
