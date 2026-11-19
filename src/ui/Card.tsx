import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { PressableScale } from './PressableScale';

export type CardProps = {
  children: ReactNode;
  /** Makes the whole card one tap target (press scale 0.98 / ripple). */
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  selected?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/** Flat, full-width surface card (sheet 11: radius 12, padding 16, no shadow). */
export function Card({
  children,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  selected,
  testID,
  style,
}: CardProps) {
  const t = useTheme();
  const base: ViewStyle = {
    backgroundColor: selected ? t.colors.accentSoft : t.colors.surface,
    borderRadius: t.radius.card,
    padding: t.spacing.card,
    borderWidth: t.sizes.hairline,
    borderColor: selected ? t.colors.accent : t.colors.surface,
  };
  if (!onPress) {
    return (
      <View testID={testID} style={[base, style]}>
        {children}
      </View>
    );
  }
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={selected === undefined ? undefined : { selected }}
      style={[base, { minHeight: t.sizes.touch }, style]}
    >
      {children}
    </PressableScale>
  );
}
