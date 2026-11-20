import { router, useLocalSearchParams } from 'expo-router';
import { Dumbbell, Trophy } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { usePro } from '@/features/billing/hooks/usePro';
import { BackButton, BigNumber, Card, EmptyState, Enter, ListRow, Screen, SectionHeader, Segmented, Text } from '@/ui';
import { useTheme } from '@/theme';

import { LineChart } from '../components/LineChart';
import { ChartSkeleton } from '../components/Skeletons';
import { RangePicker } from '../components/bits';
import { useToday, useTraining, useUnits } from '../hooks/useProgress';
import { FREE_RANGE, inRange, type Range } from '../logic/body';
import { shortDate } from '../logic/dates';
import { exerciseSessions, personalRecords } from '../logic/strength';
import { displayWeight, formatWeight, weightUnit } from '../logic/units';

type Metric = 'e1rm' | 'volume';

/** S31 Exercise records: e1RM / volume per session, best numbers and this lift's PRs. */
export function ExerciseRecordsScreen() {
  const t = useTheme();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const today = useToday();
  const units = useUnits();
  const { isPro } = usePro();
  const training = useTraining();
  const [metric, setMetric] = useState<Metric>('e1rm');
  const [range, setRange] = useState<Range>(FREE_RANGE);
  const effective = isPro ? range : FREE_RANGE;
  const wu = weightUnit(units);

  const all = useMemo(() => exerciseSessions(training.sets, id), [training.sets, id]);
  const rows = useMemo(
    () => all.filter((r) => inRange(r.date, effective, today)),
    [all, effective, today],
  );
  const prs = useMemo(
    () => personalRecords(training.sets).filter((p) => p.exerciseId === id),
    [training.sets, id],
  );
  const best = all.reduce((m, r) => Math.max(m, r.e1rm ?? 0), 0);
  const heaviest = all.reduce((m, r) => Math.max(m, r.topWeightKg), 0);
  const points = rows.filter((r) => (metric === 'e1rm' ? r.e1rm != null : r.volumeKg > 0));
  const name = training.exerciseName(id);
  const back = <BackButton fallback="/progress" />;

  return (
    <Screen
      title={training.loading ? 'Exercise' : name}
      headerLeft={back}
      testID="screen-progress-exercise"
    >
      {training.loading ? (
        <ChartSkeleton />
      ) : all.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title="No sets logged for this lift"
          body="Tick a set in a workout and its records appear here."
          testID="exercise-empty"
        />
      ) : (
        <>
          <Enter index={0}>
            <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
              <View style={{ flex: 1 }}>
                <BigNumber
                  value={displayWeight(best, units)}
                  decimals={1}
                  unit={wu}
                  label="Best estimated 1RM"
                  testID="exercise-best"
                />
              </View>
            </View>
            <Text variant="callout" color="textSecondary">
              {`Heaviest set ${formatWeight(heaviest, units)} · ${all.length} ${all.length === 1 ? 'session' : 'sessions'}`}
            </Text>
          </Enter>
          <Segmented
            testID="exercise-metric"
            accessibilityLabel="Chart"
            options={[
              { value: 'e1rm', label: 'Estimated 1RM' },
              { value: 'volume', label: 'Volume' },
            ]}
            value={metric}
            onChange={setMetric}
          />
          {points.length === 0 ? (
            <Card>
              <Text variant="callout" color="textSecondary">
                {metric === 'e1rm'
                  ? 'Sets of 1–12 reps with weight give an estimate.'
                  : 'No sets in this range.'}
              </Text>
            </Card>
          ) : (
            <LineChart
              testID="exercise-chart"
              labels={points.map((r) => shortDate(r.date))}
              format={(v) => `${v} ${wu}`}
              accessibilityLabel={`${name} ${metric === 'e1rm' ? 'estimated 1RM' : 'volume'} over ${points.length} sessions`}
              series={[
                {
                  label: metric === 'e1rm' ? 'Estimated 1RM' : 'Volume',
                  values: points.map((r) =>
                    displayWeight(metric === 'e1rm' ? (r.e1rm as number) : r.volumeKg, units),
                  ),
                  color: 'accent',
                  area: true,
                },
              ]}
            />
          )}
          <RangePicker
            value={effective}
            onChange={setRange}
            isPro={isPro}
            onLocked={() => router.push({ pathname: '/paywall', params: { source: 'records' } })}
          />

          <SectionHeader title="Records" />
          {prs.length === 0 ? (
            <Text variant="callout" color="textSecondary">
              Beat your heaviest set to set your first PR.
            </Text>
          ) : (
            prs.map((p, i) => (
              <ListRow
                key={p.sessionId}
                icon={Trophy}
                title={
                  p.kind === 'weight'
                    ? `${formatWeight(p.valueKg, units)} × ${p.reps}`
                    : `e1RM ${formatWeight(p.valueKg, units)}`
                }
                subtitle={`${shortDate(p.date)} · beat ${formatWeight(p.previousKg, units)}`}
                divider={i < prs.length - 1}
                testID={`exercise-pr-${i}`}
              />
            ))
          )}

          <SectionHeader title="Sessions" />
          {[...rows]
            .reverse()
            .slice(0, 12)
            .map((r, i) => (
              <ListRow
                key={r.sessionId}
                title={shortDate(r.date)}
                subtitle={`${r.sets} ${r.sets === 1 ? 'set' : 'sets'} · ${formatWeight(r.volumeKg, units)} volume`}
                value={`${displayWeight(r.topWeightKg, units)} × ${r.topReps}`}
                divider={i < Math.min(rows.length, 12) - 1}
              />
            ))}
        </>
      )}
    </Screen>
  );
}
