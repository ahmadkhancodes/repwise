import { Lock } from 'lucide-react-native';
import { View } from 'react-native';

import { openGate } from '@/features/billing';
import { useTheme } from '@/theme';
import { Button, Text } from '@/ui';

import { monthName, type MonthKey } from '../logic/dates';

/**
 * Free users see older months as a calm locked state, not a sudden paywall jump. One rule for
 * the Progress calendar AND Wrapped (isMonthLocked, UI audit P2-12).
 */
export function LockedMonth({
  month,
  testID = 'progress-month-locked',
}: {
  month: MonthKey;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <View
      testID={testID}
      style={{
        minHeight: t.sizes.ringHero,
        borderRadius: t.radius.card,
        backgroundColor: t.colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        padding: t.spacing.xl,
        gap: t.spacing.sm,
      }}
    >
      <Lock size={t.sizes.icon} color={t.colors.textPrimary} strokeWidth={t.sizes.iconStroke} />
      <Text variant="headline" align="center">
        {`${monthName(month.month)} is in your history`}
      </Text>
      <Text variant="callout" color="textSecondary" align="center">
        Free shows this month and last month. Pro keeps every month.
      </Text>
      <Button
        label="See Pro"
        variant="secondary"
        onPress={() => openGate('progress')}
        testID="progress-month-unlock"
      />
    </View>
  );
}
