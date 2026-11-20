import { Children, isValidElement, type ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Text } from './Text';

export type ListGroupProps = {
  /** Small eyebrow header above the group ("Account"). */
  title?: string;
  /** Footnote under the group (plain words, why a setting matters). */
  footnote?: string;
  children: ReactNode;
  testID?: string;
};

/**
 * Grouped list (sheet 11 lists, UI audit P2-13): a quiet eyebrow header, the rows on one surface
 * card with hairline dividers between them, an optional footnote. Every list of navigation rows
 * uses it (Settings, Help, Eat, Progress). Rows are ListRow / ToggleRow.
 */
export function ListGroup({ title, footnote, children, testID }: ListGroupProps) {
  const t = useTheme();
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View testID={testID} style={{ gap: t.spacing.xs }}>
      {title ? (
        <Text
          variant="eyebrow"
          color="textSecondary"
          accessibilityRole="header"
          style={{ paddingHorizontal: t.spacing.xxs }}
        >
          {title}
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
