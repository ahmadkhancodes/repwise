import { Check } from 'lucide-react-native';

import { useTheme } from '@/theme';

import { PressableScale } from './PressableScale';
import { Text } from './Text';

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  testID?: string;
};

/** Pill toggle for filters and quiz answers. Selected = accentSoft + accent border + check. */
export function Chip({ label, selected = false, onPress, disabled, testID }: ChipProps) {
  const t = useTheme();
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      feedback="selection"
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled: Boolean(disabled) }}
      style={{
        minHeight: t.sizes.touch,
        paddingHorizontal: t.spacing.md,
        borderRadius: t.radius.pill,
        borderWidth: t.sizes.hairline,
        borderColor: selected ? t.colors.accent : t.colors.border,
        backgroundColor: selected ? t.colors.accentSoft : t.colors.bg,
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: t.spacing.xxs,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {selected ? (
        <Check
          color={t.colors.textPrimary}
          size={t.sizes.iconSmall}
          strokeWidth={t.sizes.iconStroke}
        />
      ) : null}
      <Text variant="callout">{label}</Text>
    </PressableScale>
  );
}
