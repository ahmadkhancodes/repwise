import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { useTheme } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';

export type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
};

/** Calm empty/error state: icon in a soft circle, title, one line, optional action. */
export function EmptyState({
  icon: Icon,
  title,
  body,
  actionLabel,
  onAction,
  testID,
}: EmptyStateProps) {
  const t = useTheme();
  return (
    <View
      testID={testID}
      style={{ alignItems: 'center', paddingVertical: t.spacing.xxl, gap: t.spacing.sm }}
    >
      {Icon ? (
        <View
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={{
            width: t.sizes.touch + t.spacing.md,
            height: t.sizes.touch + t.spacing.md,
            borderRadius: t.radius.pill,
            backgroundColor: t.colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: t.spacing.xs,
          }}
        >
          <Icon
            color={t.colors.textSecondary}
            size={t.sizes.icon}
            strokeWidth={t.sizes.iconStroke}
          />
        </View>
      ) : null}
      <Text variant="headline" align="center" accessibilityRole="header">
        {title}
      </Text>
      {body ? (
        <Text variant="body" color="textSecondary" align="center">
          {body}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          onPress={onAction}
          variant="secondary"
          style={{ alignSelf: 'stretch', marginTop: t.spacing.xs }}
          testID={testID ? `${testID}-action` : undefined}
        />
      ) : null}
    </View>
  );
}
