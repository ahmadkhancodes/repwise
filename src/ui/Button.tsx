import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native';

import { fonts, useTheme, type ColorToken } from '@/theme';

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
  /**
   * Second line under the label, e.g. the set target on "Log set 2" (UI audit N6): the label
   * stays on one line at 360dp and 130% font instead of wrapping into an uneven button.
   */
  caption?: string;
  /** Tight side padding for buttons that share a row (rest timer, footers beside chevrons). */
  compact?: boolean;
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
  caption,
  compact = false,
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
  // Shared-row buttons never wrap: one line, shrinking slightly before it would clip.
  const oneLine =
    compact || caption
      ? ({ numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.8 } as const)
      : {};

  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (caption ? `${label}, ${caption}` : label)}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={[
        {
          minHeight: variant === 'tertiary' ? t.sizes.touch : t.sizes.button,
          minWidth: 0,
          borderRadius: t.radius.button,
          backgroundColor: p.bg ? t.colors[p.bg] : 'transparent',
          borderWidth: p.border ? t.sizes.hairline : 0,
          borderColor: p.border ? t.colors[p.border] : 'transparent',
          paddingHorizontal: compact ? t.spacing.sm : t.spacing.lg,
          paddingVertical: t.spacing.sm,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.4 : 1,
        },
        style,
      ]}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.xs,
          maxWidth: '100%',
        }}
      >
        {loading ? (
          <ActivityIndicator color={fg} testID={testID ? `${testID}-spinner` : undefined} />
        ) : (
          <>
            {Icon ? <Icon color={fg} size={t.sizes.icon} strokeWidth={t.sizes.iconStroke} /> : null}
            <View style={{ flexShrink: 1, alignItems: 'center' }}>
              <Text
                variant="headline"
                // Sheet 11: bold button labels.
                style={{ color: fg, fontFamily: fonts.bold }}
                align="center"
                {...oneLine}
                testID={testID ? `${testID}-label` : undefined}
              >
                {label}
              </Text>
              {caption ? (
                <Text
                  variant="callout"
                  tabular
                  style={{ color: fg, opacity: 0.8 }}
                  align="center"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  testID={testID ? `${testID}-caption` : undefined}
                >
                  {caption}
                </Text>
              ) : null}
            </View>
          </>
        )}
      </View>
    </PressableScale>
  );
}
