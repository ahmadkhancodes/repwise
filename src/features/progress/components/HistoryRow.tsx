import { router } from 'expo-router';
import {
  ChevronRight,
  Dumbbell,
  Lock,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react-native';
import { memo } from 'react';
import { View } from 'react-native';

import { openGate } from '@/features/billing';
import { useTheme } from '@/theme';
import { Button, PressableScale, Text } from '@/ui';

export type HistoryRowModel =
  | {
      kind: 'workout';
      sessionId: string;
      title: string;
      /** "Thu 19 Nov" — shown when the list is not grouped by day. */
      date?: string;
      /** "52 min · 18 sets". */
      detail: string;
      /** "4,120 kg". */
      value?: string;
    }
  | { kind: 'food'; date: string; dateLabel?: string; detail: string; value: string };

/**
 * One history row, everywhere (UI audit N4): Train › History and Progress › History share it.
 * A workout opens its summary; a food day opens that day's log.
 */
export const HistoryRow = memo(function HistoryRow({
  item,
  testID,
}: {
  item: HistoryRowModel;
  testID?: string;
}) {
  const t = useTheme();
  const workout = item.kind === 'workout';
  const Icon: LucideIcon = workout ? Dumbbell : UtensilsCrossed;
  const title = workout ? item.title : 'Food';
  const when = workout ? item.date : item.dateLabel;
  const open = () =>
    workout
      ? router.push(`/workout/${item.sessionId}/summary`)
      : router.push({ pathname: '/meal/day/[date]', params: { date: item.date } });
  return (
    <PressableScale
      testID={testID}
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={[title, when, item.detail, item.value].filter(Boolean).join(', ')}
      accessibilityHint={workout ? 'Opens the workout summary' : 'Opens that day’s food log'}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.sm,
        minHeight: t.sizes.row,
        padding: t.spacing.card,
        backgroundColor: t.colors.surface,
        borderRadius: t.radius.card,
      }}
    >
      <View
        style={{
          width: t.spacing.xxxl,
          height: t.spacing.xxxl,
          borderRadius: t.radius.pill,
          backgroundColor: t.colors.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon
          color={t.colors.textPrimary}
          size={t.sizes.iconMedium}
          strokeWidth={t.sizes.iconStroke}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: t.spacing.xxs / 2 }}>
        {when ? (
          <Text variant="caption" color="textSecondary" tabular numberOfLines={1}>
            {when}
          </Text>
        ) : null}
        <Text variant="headline" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="callout" color="textSecondary" tabular numberOfLines={1}>
          {item.detail}
        </Text>
      </View>
      {item.value ? (
        <Text variant="callout" tabular numberOfLines={1}>
          {item.value}
        </Text>
      ) : null}
      <ChevronRight
        color={t.colors.textTertiary}
        size={t.sizes.iconMedium}
        strokeWidth={t.sizes.iconStroke}
      />
    </PressableScale>
  );
});

/** Footer under a gated history: how much Pro keeps, one button to the paywall. */
export function HistoryProFooter({
  hidden,
  noun,
  testID = 'history-more',
}: {
  hidden: number;
  noun: 'day' | 'workout';
  testID?: string;
}) {
  const t = useTheme();
  if (hidden <= 0) return null;
  return (
    <View
      style={{ marginTop: t.spacing.lg, gap: t.spacing.sm, alignItems: 'center' }}
      testID={testID}
    >
      <Lock size={t.sizes.icon} color={t.colors.textSecondary} strokeWidth={t.sizes.iconStroke} />
      <Text variant="callout" color="textSecondary" align="center">
        {`${hidden} older ${hidden === 1 ? noun : `${noun}s`} ${hidden === 1 ? 'is' : 'are'} kept safe. See all your history with Pro.`}
      </Text>
      <Button
        label="See Pro"
        variant="secondary"
        onPress={() => openGate('history')}
        testID="history-pro"
      />
    </View>
  );
}
