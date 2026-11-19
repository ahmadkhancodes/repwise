import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme, type ColorToken } from '@/theme';

import { PressableScale } from './PressableScale';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  /** Accent fill — only for 'Start workout' and 'Start trial' (sheet 11). Primary only. */
  accent?: boolean;
  icon?: LucideIcon;
  disabled?: boolean;
  loading?: boolean;
  /** Spoken label when it should differ from the visible one. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

type Palette = { bg: ColorToken | null; fg: ColorToken; border: ColorToken | null };

export function buttonPalette(variant: ButtonVariant, accent: boolean): Palette {
  switch (variant) {
    case 'primary':
      return accent
        ? { bg: 'accent', fg: 'onAccent', border: null }
        : { bg: 'inverse', fg: 'onInverse', border: null };
    case 'secondary':
      return { bg: 'surface', fg: 'textPrimary', border: 'border' };
    case 'tertiary':
      return { bg: null, fg: 'textPrimary', border: null };
    case 'destructive':
      return { bg: 'danger', fg: 'onDanger', border: null };
  }
}

/** Full-width button. Min height 56 (48 for tertiary) and grows with font scale. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  accent = false,
  icon: Icon,
  disabled = false,
  loading = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
}: ButtonProps) {
  const t = useTheme();
  const p = buttonPalette(variant, accent && variant === 'primary');
  const inactive = disabled || loading;
  const fg = t.colors[p.fg];

  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={[
        {
          minHeight: variant === 'tertiary' ? t.sizes.touch : t.sizes.button,
          borderRadius: t.radius.button,
          backgroundColor: p.bg ? t.colors[p.bg] : 'transparent',
          borderWidth: p.border ? t.sizes.hairline : 0,
          borderColor: p.border ? t.colors[p.border] : 'transparent',
          paddingHorizontal: t.spacing.lg,
          paddingVertical: t.spacing.sm,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.4 : 1,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}>
        {loading ? (
          <ActivityIndicator color={fg} testID={testID ? `${testID}-spinner` : undefined} />
        ) : (
          <>
            {Icon ? <Icon color={fg} size={t.sizes.icon} strokeWidth={t.sizes.iconStroke} /> : null}
            <Text variant="headline" style={{ color: fg }} align="center">
              {label}
            </Text>
          </>
        )}
      </View>
    </PressableScale>
  );
}
