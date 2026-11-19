import {
  Platform,
  Text as RNText,
  type TextProps as RNTextProps,
  type TextStyle,
} from 'react-native';

import { useTheme, type ColorToken, type TypeVariant } from '@/theme';

export type TextProps = RNTextProps & {
  variant?: TypeVariant;
  color?: ColorToken;
  align?: TextStyle['textAlign'];
  /** Tabular figures for numbers that change (timers, weights, kcal). */
  tabular?: boolean;
};

/** Themed text. Scales with the OS font size (capped only on display/title sizes). */
export function Text({
  variant = 'body',
  color = 'textPrimary',
  align,
  tabular,
  style,
  ...rest
}: TextProps) {
  const t = useTheme();
  const type = t.typography[variant];
  return (
    <RNText
      maxFontSizeMultiplier={type.maxFontSizeMultiplier}
      {...rest}
      style={[
        {
          fontFamily: type.fontFamily,
          fontSize: type.fontSize,
          lineHeight: type.lineHeight,
          color: t.colors[color],
          textAlign: align,
          letterSpacing: type.letterSpacing,
        },
        (tabular ?? type.tabular) && { fontVariant: ['tabular-nums'] },
        // Android adds extra top padding to custom fonts; strip it so Inter sits on the baseline.
        Platform.OS === 'android' && { includeFontPadding: false },
        style,
      ]}
    />
  );
}
