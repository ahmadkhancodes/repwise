import { Check, type LucideIcon } from 'lucide-react-native';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';
import { PressableScale, Text } from '@/ui';

export type OptionTileProps = {
  label: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
  icon?: LucideIcon;
  /** radio = one answer, checkbox = many. */
  kind?: 'radio' | 'checkbox';
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/** Big quiz answer tile (S03–S05): full width, 64+ high, selected = accentSoft + accent border. */
export function OptionTile({
  label,
  detail,
  selected,
  onPress,
  icon: Icon,
  kind = 'radio',
  testID,
  style,
}: OptionTileProps) {
  const t = useTheme();
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      feedback="selection"
      accessibilityRole={kind}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      accessibilityState={kind === 'radio' ? { selected } : { checked: selected }}
      style={[
        {
          minHeight: t.sizes.button + t.spacing.xs,
          borderRadius: t.radius.card,
          borderWidth: t.sizes.hairline * 2,
          borderColor: selected ? t.colors.accent : t.colors.border,
          backgroundColor: selected ? t.colors.accentSoft : t.colors.surface,
          paddingHorizontal: t.spacing.md,
          paddingVertical: t.spacing.sm,
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm,
        },
        style,
      ]}
    >
      {Icon ? (
        <View
          style={{
            width: t.sizes.touch - t.spacing.xs,
            height: t.sizes.touch - t.spacing.xs,
            borderRadius: t.radius.pill,
            backgroundColor: selected ? t.colors.accent : t.colors.bg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon
            size={t.sizes.icon}
            strokeWidth={t.sizes.iconStroke}
            color={selected ? t.colors.onAccent : t.colors.textPrimary}
          />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: t.spacing.xxs / 2 }}>
        <Text variant="headline">{label}</Text>
        {detail ? (
          <Text variant="callout" color="textSecondary">
            {detail}
          </Text>
        ) : null}
      </View>
      <View
        style={{
          width: t.sizes.icon,
          height: t.sizes.icon,
          borderRadius: kind === 'radio' ? t.radius.pill : t.radius.button / 2,
          borderWidth: selected ? 0 : t.sizes.hairline * 2,
          borderColor: t.colors.border,
          backgroundColor: selected ? t.colors.textPrimary : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? (
          <Check
            size={t.sizes.iconSmall}
            strokeWidth={t.sizes.iconStroke + 1}
            color={t.colors.bg}
          />
        ) : null}
      </View>
    </PressableScale>
  );
}
