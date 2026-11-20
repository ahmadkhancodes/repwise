import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Badge, PressableScale, Switch, SwitchTrack, Text } from '@/ui';

export type ToggleRowProps = {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Trailing badge instead of the switch, e.g. "Pro" (row then calls onLockedPress). */
  locked?: string;
  onLockedPress?: () => void;
  /**
   * Makes the text part its own button (e.g. "change the time") next to a standalone switch.
   * Without it the whole row is the switch.
   */
  onPressDetail?: () => void;
  /** Spoken hint for the detail button, e.g. "Changes the time". */
  detailHint?: string;
  /** testID of the detail button (default `<testID>-detail`). */
  detailTestID?: string;
  divider?: boolean;
  testID?: string;
};

/**
 * Settings row with an on/off switch (shared SwitchTrack / Switch: borderStrong off-state, spring
 * thumb). Three shapes, never nested pressables:
 * - default: the whole 56dp row is one switch (role "switch", checked state);
 * - `onPressDetail`: text = button (opens a time picker), switch = its own 48dp control;
 * - `locked`: the row is a button with a Pro badge that opens the paywall.
 */
export function ToggleRow({
  title,
  subtitle,
  icon: Icon,
  value,
  onChange,
  disabled,
  locked,
  onLockedPress,
  onPressDetail,
  detailHint,
  detailTestID,
  divider = false,
  testID,
}: ToggleRowProps) {
  const t = useTheme();
  const isLocked = Boolean(locked);
  const label = [title, subtitle, locked].filter(Boolean).join(', ');

  const rowStyle = {
    minHeight: t.sizes.row,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: t.spacing.sm,
    paddingVertical: t.spacing.sm,
    borderBottomWidth: divider ? t.sizes.hairline : 0,
    borderBottomColor: t.colors.border,
    opacity: disabled ? 0.4 : 1,
  };

  const texts = (
    <>
      {Icon ? (
        <Icon color={t.colors.textPrimary} size={t.sizes.icon} strokeWidth={t.sizes.iconStroke} />
      ) : null}
      <View style={{ flex: 1, gap: t.spacing.xxs }}>
        <Text variant="body">{title}</Text>
        {subtitle ? (
          <Text variant="callout" color="textSecondary" tabular>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </>
  );

  if (onPressDetail && !isLocked) {
    return (
      <View style={rowStyle}>
        <PressableScale
          testID={detailTestID ?? (testID ? `${testID}-detail` : undefined)}
          feedback="selection"
          disabled={disabled}
          onPress={onPressDetail}
          accessibilityRole="button"
          accessibilityLabel={[title, subtitle].filter(Boolean).join(', ')}
          accessibilityHint={detailHint}
          style={{
            flex: 1,
            minHeight: t.sizes.touch,
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm,
          }}
        >
          {texts}
          <ChevronRight
            color={t.colors.textTertiary}
            size={t.sizes.iconMedium}
            strokeWidth={t.sizes.iconStroke}
          />
        </PressableScale>
        <Switch
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          accessibilityLabel={title}
          testID={testID}
        />
      </View>
    );
  }

  return (
    <PressableScale
      testID={testID}
      feedback="selection"
      disabled={disabled}
      onPress={() => (isLocked ? onLockedPress?.() : onChange(!value))}
      accessibilityRole={isLocked ? 'button' : 'switch'}
      accessibilityLabel={label}
      accessibilityState={
        isLocked ? { disabled: Boolean(disabled) } : { checked: value, disabled: Boolean(disabled) }
      }
      style={rowStyle}
    >
      {texts}
      {isLocked ? (
        <Badge label={locked!} tone="accent" />
      ) : (
        <SwitchTrack value={value} testID={testID ? `${testID}-track` : undefined} />
      )}
    </PressableScale>
  );
}
