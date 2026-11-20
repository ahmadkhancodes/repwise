import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export type SectionHeaderProps = {
  title: string;
  /**
   * 'section' (default): a screen section, title2 ("This week", "Ingredients").
   * 'card': a header inside a card, headline ("Meals").
   */
  level?: 'section' | 'card';
  /** Trailing element: a count, a "See all" button, a range picker. */
  trailing?: ReactNode;
  testID?: string;
};

/** The one section header (UI audit P2-2): same type, spacing and a11y role everywhere. */
export function SectionHeader({ title, level = 'section', trailing, testID }: SectionHeaderProps) {
  const t = useTheme();
  const section = level === 'section';
  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: section ? 'center' : 'baseline',
        gap: t.spacing.sm,
        marginTop: section ? t.spacing.xs : 0,
      }}
    >
      <Text
        variant={section ? 'title2' : 'headline'}
        accessibilityRole="header"
        style={{ flex: 1 }}
      >
        {title}
      </Text>
      {trailing}
    </View>
  );
}
