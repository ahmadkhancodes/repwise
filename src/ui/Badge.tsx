import type { LucideIcon } from 'lucide-react-native';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme, type ColorToken } from '@/theme';

import { Text } from './Text';

export type BadgeTone = 'neutral' | 'accent' | 'inverse' | 'outline' | 'danger';

/** Fill / border / text tokens per tone. Every text pair is AA in both themes. Pure. */
export function badgePalette(tone: BadgeTone): {
  bg: ColorToken | null;
  fg: ColorToken;
  border: ColorToken | null;
} {
  switch (tone) {
    case 'neutral':
      return { bg: 'surface2', fg: 'textPrimary', border: null };
    case 'accent':
      return { bg: 'accentSoft', fg: 'accentText', border: null };
    case 'inverse':
      return { bg: 'inverse', fg: 'onInverse', border: null };
    case 'outline':
      return { bg: null, fg: 'textSecondary', border: 'borderStrong' };
    case 'danger':
      return { bg: 'danger', fg: 'onDanger', border: null };
  }
}

export type BadgeProps = {
  label: string;
  /** neutral (muscle tags), accent ("Pro", "Yours", delta), inverse ("Best value"), outline, danger. */
  tone?: BadgeTone;
  icon?: LucideIcon;
  /** Spoken label when it should differ (e.g. "+150 kcal" → "150 calories more"). */
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/** Small static pill (not pressable). Use Chip for anything you can tap. */
export function Badge({
  label,
  tone = 'neutral',
  icon: Icon,
  accessibilityLabel,
  testID,
  style,
}: BadgeProps) {
  const t = useTheme();
  const p = badgePalette(tone);
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        {
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.xxs,
          paddingHorizontal: t.spacing.xs,
          paddingVertical: t.spacing.xxs / 2,
          borderRadius: t.radius.pill,
          backgroundColor: p.bg ? t.colors[p.bg] : 'transparent',
          borderWidth: p.border ? t.sizes.hairline : 0,
          borderColor: p.border ? t.colors[p.border] : undefined,
        },
        style,
      ]}
    >
      {Icon ? (
        <Icon color={t.colors[p.fg]} size={t.sizes.iconSmall} strokeWidth={t.sizes.iconStroke} />
      ) : null}
      <Text variant="caption" color={p.fg} tabular numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
