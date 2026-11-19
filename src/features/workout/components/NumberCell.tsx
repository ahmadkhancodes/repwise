import { useState } from 'react';
import { Platform, TextInput } from 'react-native';

import { useTheme } from '@/theme';

/** Compact numeric input for set rows: tabular, centred, commits on blur/submit. */
export function NumberCell({
  value,
  placeholder,
  onCommit,
  accessibilityLabel,
  decimal = true,
  done,
  testID,
}: {
  value: string;
  placeholder?: string;
  onCommit: (text: string) => void;
  accessibilityLabel: string;
  decimal?: boolean;
  done?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  const [text, setText] = useState(value);
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    // The stored value changed (pre-fill, swap, sync): show it.
    setShown(value);
    setText(value);
  }
  const type = t.typography.headline;
  const commit = () => {
    if (text !== value) onCommit(text);
  };
  return (
    <TextInput
      testID={testID}
      value={text}
      onChangeText={setText}
      onEndEditing={commit}
      onSubmitEditing={commit}
      placeholder={placeholder}
      placeholderTextColor={t.colors.textTertiary}
      keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
      returnKeyType="done"
      selectTextOnFocus
      maxLength={6}
      accessibilityLabel={accessibilityLabel}
      maxFontSizeMultiplier={1.3}
      style={[
        {
          flex: 1,
          minWidth: t.sizes.touch,
          minHeight: t.sizes.touch - t.spacing.xxs,
          borderRadius: t.radius.input,
          backgroundColor: done ? 'transparent' : t.colors.surface2,
          color: t.colors.textPrimary,
          fontFamily: type.fontFamily,
          fontSize: type.fontSize,
          textAlign: 'center',
          fontVariant: ['tabular-nums'],
          paddingHorizontal: t.spacing.xxs,
          paddingVertical: 0,
        },
        Platform.OS === 'android' && { includeFontPadding: false, textAlignVertical: 'center' },
      ]}
    />
  );
}
