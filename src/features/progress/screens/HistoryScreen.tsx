import { CircleAlert, History } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { SectionList, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePro } from '@/features/billing/hooks/usePro';
import { useTheme } from '@/theme';
import { BackButton, EmptyState, Screen, SectionHeader } from '@/ui';

import { HistoryProFooter, HistoryRow, type HistoryRowModel } from '../components/HistoryRow';
import { RowsSkeleton } from '../components/Skeletons';
import { useNutrition, useToday, useTraining, useUnits } from '../hooks/useProgress';
import { dayLabel } from '../logic/dates';
import { gateHistory, historySections, type HistoryItem } from '../logic/history';
import { formatLoad } from '../logic/units';

const AnimatedSectionList = Animated.createAnimatedComponent(SectionList<HistoryItem>);

/** History item → the shared row model (one design with Train › History). Pure. */
export function historyRowModel(
  item: HistoryItem,
  units: Parameters<typeof formatLoad>[1],
): HistoryRowModel {
  return item.kind === 'workout'
    ? {
        kind: 'workout',
        sessionId: item.sessionId,
        title: item.title,
        detail: [item.minutes ? `${item.minutes} min` : null, `${item.sets} sets`]
          .filter(Boolean)
          .join(' · '),
        value: item.volumeKg > 0 ? formatLoad(item.volumeKg, units) : undefined,
      }
    : {
        kind: 'food',
        date: item.date,
        detail: `${item.entries} ${item.entries === 1 ? 'item' : 'items'} logged`,
        value: `${item.kcal.toLocaleString('en-US')} kcal`,
      };
}

/**
 * S36 History: every finished workout and food day, newest first. THE history (UI audit N4):
 * Train › History uses the same rows and the same free window (gateHistory).
 */
export function HistoryScreen() {
  // "Try again" remounts the live queries.
  const [attempt, setAttempt] = useState(0);
  return <HistoryBody key={attempt} retry={() => setAttempt((a) => a + 1)} />;
}

function HistoryBody({ retry }: { retry: () => void }) {
  const t = useTheme();
  const today = useToday();
  const units = useUnits();
  const { isPro } = usePro();
  const training = useTraining();
  const nutrition = useNutrition();
  const all = useMemo(
    () => historySections(training.sessions, training.sets, nutrition.logs),
    [training.sessions, training.sets, nutrition.logs],
  );
  const { visible: sections, hidden } = gateHistory(all, (s) => s.date, isPro, today);
  const loading = training.loading || nutrition.loading;
  const error = training.error ?? nutrition.error;

  return (
    <Screen
      title="History"
      headerLeft={<BackButton fallback="/progress" />}
      testID="screen-progress-history"
      list={(p) => (
        <AnimatedSectionList
          onScroll={p.onScroll}
          scrollEventThrottle={p.scrollEventThrottle}
          keyboardShouldPersistTaps={p.keyboardShouldPersistTaps}
          contentContainerStyle={[p.contentContainerStyle, { gap: t.spacing.xs }]}
          sections={loading || error ? [] : sections}
          keyExtractor={(item) => item.key}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={
            <View style={{ gap: t.spacing.md }}>
              {p.largeTitle}
              {loading ? <RowsSkeleton /> : null}
              {error ? (
                <EmptyState
                  icon={CircleAlert}
                  title="History didn't load"
                  body="Your data is safe on this phone."
                  actionLabel="Try again"
                  onAction={retry}
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
            <View style={{ marginTop: t.spacing.md }}>
              <SectionHeader
                level="card"
                title={section.date === today ? 'Today' : dayLabel(section.date)}
              />
            </View>
          )}
          renderItem={({ item }) => (
            <HistoryRow item={historyRowModel(item, units)} testID={`history-${item.key}`} />
          )}
          ListFooterComponent={isPro ? undefined : <HistoryProFooter hidden={hidden} noun="day" />}
        />
      )}
    />
  );
}
