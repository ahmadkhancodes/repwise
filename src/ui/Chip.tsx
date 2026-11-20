import { Check } from 'lucide-react-native';

import { useTheme } from '@/theme';

import { PressableScale } from './PressableScale';
import { Text } from './Text';

export type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  /**
   * 'checkbox' (default, multi-select filters), 'radio' (one-of: set type, RPE, goal) or
   * 'button' (actions like "+250 ml"). Static tags use Badge instead.
   */
  role?: 'checkbox' | 'radio' | 'button';
  testID?: string;
};

/** Pill toggle for filters and quiz answers. Selected = accentSoft + accent border + check. */
export function Chip({
  label,
  selected = false,
  onPress,
  disabled,
  role = 'checkbox',
  testID,
}: ChipProps) {
  const t = useTheme();
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      feedback={role === 'button' ? 'light' : 'selection'}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={
        role === 'button'
          ? { disabled: Boolean(disabled) }
          : role === 'radio'
            ? { selected, checked: selected, disabled: Boolean(disabled) }
            : { checked: selected, disabled: Boolean(disabled) }
      }
      style={{
        minHeight: t.sizes.touch,
        paddingHorizontal: t.spacing.md,
        borderRadius: t.radius.pill,
        borderWidth: t.sizes.hairline,
        borderColor: selected ? t.colors.accent : t.colors.borderStrong,
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
