import { router } from 'expo-router';
import {
  ChevronLeft,
  CircleAlert,
  Dumbbell,
  History,
  Lock,
  UtensilsCrossed,
} from 'lucide-react-native';
import { useMemo } from 'react';
import { SectionList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePro } from '@/features/billing/hooks/usePro';
import { Button, EmptyState, IconButton, ListRow, Text } from '@/ui';
import { useTheme } from '@/theme';

import { RowsSkeleton } from '../components/Skeletons';
import { useNutrition, useToday, useTraining, useUnits } from '../hooks/useProgress';
import { addDays } from '../logic/engine';
import { dayLabel } from '../logic/dates';
import { historySections } from '../logic/history';
import { formatLoad } from '../logic/units';

/** S36 History: every finished workout and food day, newest first. Free shows 30 days. */
export function HistoryScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const today = useToday();
  const units = useUnits();
  const { isPro } = usePro();
  const training = useTraining();
  const nutrition = useNutrition();
  const all = useMemo(
    () => historySections(training.sessions, training.sets, nutrition.logs),
    [training.sessions, training.sets, nutrition.logs],
  );
  const from = addDays(today, -29);
  const sections = isPro ? all : all.filter((s) => s.date >= from);
  const hidden = all.length - sections.length;
  const loading = training.loading || nutrition.loading;
  const error = training.error ?? nutrition.error;

  return (
    <View
      testID="screen-progress-history"
      style={{ flex: 1, backgroundColor: t.colors.bg, paddingTop: insets.top }}
    >
      <View
        style={{
          minHeight: t.sizes.touch,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: t.spacing.xs,
        }}
      >
        <IconButton
          icon={ChevronLeft}
          accessibilityLabel="Back"
          onPress={() => router.back()}
          testID="back"
        />
      </View>
      <SectionList
        sections={loading || error ? [] : sections}
        keyExtractor={(item) => item.key}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{
          paddingHorizontal: t.spacing.screen,
          paddingBottom: insets.bottom + t.spacing.xl,
          gap: t.spacing.xxs,
        }}
        ListHeaderComponent={
          <View style={{ gap: t.spacing.md, marginBottom: t.spacing.xs }}>
            <Text variant="title1" accessibilityRole="header">
              History
            </Text>
            {loading ? <RowsSkeleton /> : null}
            {error ? (
              <EmptyState
                icon={CircleAlert}
                title="History didn't load"
                body="Your data is safe on this phone. Try again in a moment."
                testID="history-error"
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading || error ? undefined : (
            <EmptyState
              icon={History}
              title="No history yet"
              body="Finished workouts and logged food days appear here."
              testID="history-empty"
            />
          )
        }
        renderSectionHeader={({ section }) => (
          <Text variant="headline" accessibilityRole="header" style={{ marginTop: t.spacing.md }}>
            {section.date === today ? 'Today' : dayLabel(section.date)}
          </Text>
        )}
        renderItem={({ item }) =>
          item.kind === 'workout' ? (
            <ListRow
              icon={Dumbbell}
              title={item.title}
              subtitle={[item.minutes ? `${item.minutes} min` : null, `${item.sets} sets`]
                .filter(Boolean)
                .join(' · ')}
              value={item.volumeKg > 0 ? formatLoad(item.volumeKg, units) : undefined}
              testID={`history-${item.key}`}
            />
          ) : (
            <ListRow
              icon={UtensilsCrossed}
              title="Food"
              subtitle={`${item.entries} ${item.entries === 1 ? 'item' : 'items'} logged`}
              value={`${item.kcal} kcal`}
              testID={`history-${item.key}`}
            />
          )
        }
        ListFooterComponent={
          !isPro && hidden > 0 ? (
            <View
              style={{ marginTop: t.spacing.lg, gap: t.spacing.sm, alignItems: 'center' }}
              testID="history-more"
            >
              <Lock
                size={t.sizes.icon}
                color={t.colors.textSecondary}
                strokeWidth={t.sizes.iconStroke}
              />
              <Text variant="callout" color="textSecondary" align="center">
                {`${hidden} older ${hidden === 1 ? 'day' : 'days'} are kept safe. See all your history with Pro.`}
              </Text>
              <Button
                label="See Pro"
                variant="secondary"
                onPress={() => router.push('/paywall')}
                testID="history-pro"
              />
            </View>
          ) : undefined
        }
      />
    </View>
  );
}
