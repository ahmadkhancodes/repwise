import { Children, isValidElement, type ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Text } from '@/ui';

export type SettingsGroupProps = {
  /** Small header above the group ("ACCOUNT"). */
  title?: string;
  /** Footnote under the group (plain words, why a setting matters). */
  footnote?: string;
  children: ReactNode;
  testID?: string;
};

/**
 * Grouped settings list (sheet 11 lists): a quiet header, the rows on one surface card with
 * hairline dividers between them, an optional footnote. Rows are ListRow / ToggleRow.
 */
export function SettingsGroup({ title, footnote, children, testID }: SettingsGroupProps) {
  const t = useTheme();
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View testID={testID} style={{ gap: t.spacing.xs }}>
      {title ? (
        <Text
          variant="caption"
          color="textSecondary"
          accessibilityRole="header"
          style={{ paddingHorizontal: t.spacing.xxs }}
        >
          {title.toUpperCase()}
        </Text>
      ) : null}
      <View
        style={{
          backgroundColor: t.colors.surface,
          borderRadius: t.radius.card,
          paddingHorizontal: t.spacing.card,
        }}
      >
        {rows.map((row, i) => (
          <View
            key={row.key ?? i}
            style={{
              borderTopWidth: i === 0 ? 0 : t.sizes.hairline,
              borderTopColor: t.colors.border,
            }}
          >
            {row}
          </View>
        ))}
      </View>
      {footnote ? (
        <Text variant="caption" color="textSecondary" style={{ paddingHorizontal: t.spacing.xxs }}>
          {footnote}
        </Text>
      ) : null}
    </View>
  );
}
