import { router } from 'expo-router';
import { CircleAlert, Plus, Ruler, Scale, Trash2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { openGate } from '@/features/billing';
import { usePro } from '@/features/billing/hooks/usePro';
import {
  BackButton,
  BigNumber,
  Button,
  Card,
  EmptyState,
  Enter,
  IconButton,
  ListRow,
  Screen,
  SectionHeader,
  Segmented,
  showToast,
  Text,
} from '@/ui';
import { useTheme } from '@/theme';

import { LineChart } from '../components/LineChart';
import { ChartSkeleton } from '../components/Skeletons';
import { RangePicker } from '../components/bits';
import { useToday, useUnits } from '../hooks/useProgress';
import { FREE_RANGE, measurementSeries, weightSeries, type Range } from '../logic/body';
import { dayLabel, shortDate } from '../logic/dates';
import { displayLength, displayWeight, lengthUnit, weightUnit } from '../logic/units';
import { deleteBodyMetric, saveBodyMetric, useLiveBody } from '../repo';

type Tab = 'weight' | 'measurements';

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n)}`;

/** S30 Body weight & measurements: 7-day trend line over daily weigh-ins, measurements, entries. */
export function BodyScreen() {
  const t = useTheme();
  const today = useToday();
  const units = useUnits();
  const { isPro } = usePro();
  const body = useLiveBody();
  const [tab, setTab] = useState<Tab>('weight');
  const [range, setRange] = useState<Range>(FREE_RANGE);
  const effective = isPro ? range : FREE_RANGE;
  const wu = weightUnit(units);
  const lu = lengthUnit(units);

  const weight = useMemo(
    () => weightSeries(body.data, effective, today, units),
    [body.data, effective, today, units],
  );
  const measures = useMemo(
    () => measurementSeries(body.data, effective, today, units),
    [body.data, effective, today, units],
  );
  const entries = useMemo(
    () => [...body.data].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 30),
    [body.data],
  );

  const remove = (id: string) => {
    const row = body.data.find((r) => r.id === id);
    if (!row || !deleteBodyMetric(id)) return;
    showToast({
      message: 'Entry deleted',
      actionLabel: 'Undo',
      onAction: () =>
        saveBodyMetric(row.date, {
          weightKg: row.weightKg,
          waistCm: row.waistCm,
          hipsCm: row.hipsCm,
          chestCm: row.chestCm,
          armCm: row.armCm,
          thighCm: row.thighCm,
          neckCm: row.neckCm,
          bodyFatPct: row.bodyFatPct,
          note: row.note,
        }),
    });
  };

  const back = <BackButton fallback="/progress" />;
  const footer = (
    <Button
      label={tab === 'weight' ? 'Add weight' : 'Add measurements'}
      icon={Plus}
      onPress={() =>
        router.push(tab === 'weight' ? '/progress/log' : '/progress/log?focus=measurements')
      }
      testID="body-add"
    />
  );

  return (
    <Screen title="Body" headerLeft={back} testID="screen-progress-body" footer={footer}>
      <Segmented
        testID="body-tab"
        accessibilityLabel="Show"
        options={[
          { value: 'weight', label: 'Weight' },
          { value: 'measurements', label: 'Measurements' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {body.loading ? (
        <ChartSkeleton />
      ) : body.error ? (
        <EmptyState
          icon={CircleAlert}
          title="Couldn't load your entries"
          body="Your data is safe on this phone. Try again in a moment."
          testID="body-error"
        />
      ) : tab === 'weight' ? (
        weight.points.length === 0 ? (
          <EmptyState
            icon={Scale}
            title={
              body.data.some((r) => r.weightKg != null)
                ? 'No weigh-ins in this range'
                : 'No weigh-ins yet'
            }
            body="Weigh in a few mornings a week. We smooth daily swings into a 7-day trend."
            testID="body-empty"
          />
        ) : (
          <Enter index={0}>
            <View style={{ gap: t.spacing.md }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-end',
                  justifyContent: 'space-between',
                }}
              >
                <BigNumber
                  value={weight.current ?? 0}
                  decimals={1}
                  unit={wu}
                  label="7-day average"
                  testID="weight-current"
                />
                {weight.change != null ? (
                  <Text variant="headline" color="textSecondary" tabular testID="weight-change">
                    {`${signed(weight.change)} ${wu}`}
                  </Text>
                ) : null}
              </View>
              <LineChart
                testID="weight-chart"
                labels={weight.points.map((p) => shortDate(p.date))}
                format={(v) => `${v} ${wu}`}
                accessibilityLabel={`Weight trend: ${weight.current} ${wu}${weight.change != null ? `, ${signed(weight.change)} ${wu} in this range` : ''}`}
                series={[
                  {
                    label: 'Weigh-ins',
                    values: weight.points.map((p) => p.value),
                    color: 'textTertiary',
                    dotsOnly: true,
                  },
                  {
                    label: 'Trend',
                    values: weight.points.map((p) => p.avg),
                    color: 'accent',
                    area: true,
                  },
                ]}
              />
              <RangePicker
                value={effective}
                onChange={setRange}
                isPro={isPro}
                onLocked={() => openGate('body')}
              />
            </View>
          </Enter>
        )
      ) : measures.length === 0 ? (
        <EmptyState
          icon={Ruler}
          title="No measurements yet"
          body="Waist, hips, chest, arms and more. Measure every couple of weeks."
          testID="measure-empty"
        />
      ) : (
        <View style={{ gap: t.spacing.md }}>
          <RangePicker
            value={effective}
            onChange={setRange}
            isPro={isPro}
            onLocked={() => openGate('body')}
          />
          {measures.map((m, i) => {
            const unit = m.kind === 'percent' ? '%' : lu;
            return (
              <Enter index={i} key={m.key}>
                <Card testID={`measure-${m.key}`}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                    }}
                  >
                    <Text variant="headline">{m.label}</Text>
                    <Text variant="headline" tabular>
                      {`${m.latest} ${unit}`}
                    </Text>
                  </View>
                  {m.change != null ? (
                    <Text variant="caption" color="textSecondary" tabular>
                      {`${signed(m.change)} ${unit} in this range`}
                    </Text>
                  ) : null}
                  {m.points.length > 1 ? (
                    <LineChart
                      height={t.sizes.touch * 2}
                      testID={`measure-chart-${m.key}`}
                      labels={m.points.map((p) => shortDate(p.date))}
                      format={(v) => `${v} ${unit}`}
                      accessibilityLabel={`${m.label} trend, latest ${m.latest} ${unit}`}
                      series={[
                        {
                          label: m.label,
                          values: m.points.map((p) => p.value),
                          color: 'textPrimary',
                          strokeWidth: t.sizes.borderThick,
                        },
                      ]}
                    />
                  ) : null}
                </Card>
              </Enter>
            );
          })}
        </View>
      )}

      {!body.loading && entries.length > 0 ? (
        <View testID="body-entries">
          <SectionHeader title="Entries" />
          {entries.map((r, i) => {
            const parts = [
              r.weightKg != null ? `${displayWeight(r.weightKg, units)} ${wu}` : null,
              r.waistCm != null ? `waist ${displayLength(r.waistCm, units)} ${lu}` : null,
              r.bodyFatPct != null ? `${r.bodyFatPct}% fat` : null,
            ].filter(Boolean);
            return (
              <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <ListRow
                    title={dayLabel(r.date)}
                    subtitle={parts.join(' · ') || 'Measurements'}
                    divider={i < entries.length - 1}
                  />
                </View>
                <IconButton
                  icon={Trash2}
                  accessibilityLabel={`Delete entry ${dayLabel(r.date)}`}
                  color="textSecondary"
                  onPress={() => remove(r.id)}
                  testID={`entry-delete-${r.date}`}
                />
              </View>
            );
          })}
        </View>
      ) : null}
    </Screen>
  );
}
