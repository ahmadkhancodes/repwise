import { useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export type TextFieldProps = Omit<TextInputProps, 'style' | 'placeholderTextColor'> & {
  label: string;
  /** Shown under the field in the danger colour and announced to screen readers. */
  error?: string | null;
  hint?: string;
  testID?: string;
};

/** Labelled single-line input. Min height 56, grows with font scale; tokens only. */
export function TextField({
  label,
  error,
  hint,
  testID,
  onFocus,
  onBlur,
  ...rest
}: TextFieldProps) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? t.colors.danger : focused ? t.colors.textPrimary : t.colors.border;
  return (
    <View style={{ gap: t.spacing.xxs }}>
      <Text
        variant="callout"
        color="textSecondary"
        nativeID={testID ? `${testID}-label` : undefined}
      >
        {label}
      </Text>
      <TextInput
        {...rest}
        testID={testID}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        placeholderTextColor={t.colors.textTertiary}
        selectionColor={t.colors.accent}
        style={{
          minHeight: t.sizes.button,
          paddingHorizontal: t.spacing.md,
          borderRadius: t.radius.input,
          borderWidth: focused || error ? 2 * t.sizes.hairline : t.sizes.hairline,
          borderColor,
          backgroundColor: t.colors.surface,
          color: t.colors.textPrimary,
          fontFamily: t.typography.body.fontFamily,
          fontSize: t.typography.body.fontSize,
        }}
      />
      {error ? (
        <Text
          variant="caption"
          color="danger"
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="textSecondary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
