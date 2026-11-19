import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { useTheme } from '@/theme';

import { PressableScale } from './PressableScale';
import { Text } from './Text';

export type ListRowProps = {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  /** Trailing value text, e.g. "kg" or "On". */
  value?: string;
  onPress?: () => void;
  /** Show the chevron (defaults to true when pressable). */
  chevron?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  divider?: boolean;
  testID?: string;
};

/** Settings-style row, min height 56. Whole row is the tap target. */
export function ListRow({
  title,
  subtitle,
  icon: Icon,
  value,
  onPress,
  chevron,
  destructive,
  disabled,
  divider = false,
  testID,
}: ListRowProps) {
  const t = useTheme();
  const showChevron = chevron ?? Boolean(onPress);
  const titleColor = destructive ? 'danger' : 'textPrimary';

  const content = (
    <>
      {Icon ? (
        <Icon
          color={t.colors[destructive ? 'danger' : 'textPrimary']}
          size={t.sizes.icon}
          strokeWidth={t.sizes.iconStroke}
        />
      ) : null}
      <View style={{ flex: 1, gap: t.spacing.xxs }}>
        <Text variant="body" color={titleColor}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="callout" color="textSecondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="callout" color="textSecondary" tabular>
          {value}
        </Text>
      ) : null}
      {showChevron ? (
        <ChevronRight
          color={t.colors.textTertiary}
          size={t.sizes.icon}
          strokeWidth={t.sizes.iconStroke}
        />
      ) : null}
    </>
  );

  const style = {
    minHeight: t.sizes.row,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: t.spacing.sm,
    paddingVertical: t.spacing.sm,
    borderBottomWidth: divider ? t.sizes.hairline : 0,
    borderBottomColor: t.colors.border,
    opacity: disabled ? 0.4 : 1,
  };

  if (!onPress) {
    return (
      <View
        testID={testID}
        style={style}
        accessible
        accessibilityLabel={[title, subtitle, value].filter(Boolean).join(', ')}
      >
        {content}
      </View>
    );
  }
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={[title, subtitle, value].filter(Boolean).join(', ')}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={style}
    >
      {content}
    </PressableScale>
  );
}
