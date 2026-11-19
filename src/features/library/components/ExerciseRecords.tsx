import { Trophy } from 'lucide-react-native';
import { useMemo } from 'react';
import { View } from 'react-native';

import { useProfile } from '@/features/settings/repo';
import { useTheme } from '@/theme';
import { BigNumber, Card, EmptyState, Text } from '@/ui';

import { friendlyDate, localISODate } from '../logic/dates';
import {
  computeRecords,
  displayVolume,
  formatWeight,
  summariseSessions,
  unitsOf,
} from '../logic/records';
import { useExerciseHistory } from '../repo';

function Stat({ label, value, testID }: { label: string; value: string; testID?: string }) {
  const t = useTheme();
  return (
    <View
      style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.spacing.sm }}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text variant="body" color="textSecondary" style={{ flexShrink: 1 }}>
        {label}
      </Text>
      <Text
        variant="body"
        tabular
        testID={testID}
        style={{ fontFamily: t.typography.headline.fontFamily }}
      >
        {value}
      </Text>
    </View>
  );
}

/** S19 "records": best estimated 1RM as the big number, other PRs and the last sessions. Live. */
export function ExerciseRecords({ exerciseId }: { exerciseId: string }) {
  const t = useTheme();
  const units = unitsOf(useProfile()?.units);
  const { sets, loaded, error } = useExerciseHistory(exerciseId);
  const records = useMemo(() => computeRecords(sets), [sets]);
  const sessions = useMemo(() => summariseSessions(sets, 5), [sets]);
  const today = localISODate();

  if (!loaded) return null; // a local query; resolves within a frame
  if (error) {
    return (
      <EmptyState
        icon={Trophy}
        title="Couldn't load your history"
        body="Your sets are safe. Reopen this screen to try again."
        testID="records-error"
      />
    );
  }
  if (!sessions.length) {
    return (
      <Card testID="records-empty">
        <View style={{ flexDirection: 'row', gap: t.spacing.sm, alignItems: 'center' }}>
          <Trophy
            color={t.colors.textSecondary}
            size={t.sizes.icon}
            strokeWidth={t.sizes.iconStroke}
          />
          <View style={{ flex: 1, gap: t.spacing.xxs }}>
            <Text variant="headline">No sets logged yet</Text>
            <Text variant="callout" color="textSecondary">
              Log this exercise in a workout and your records show up here.
            </Text>
          </View>
        </View>
      </Card>
    );
  }

  const { e1rm, heaviest, mostReps, sessionVolume } = records;
  return (
    <View style={{ gap: t.spacing.md }} testID="records">
      <Card>
        <View style={{ gap: t.spacing.md }}>
          {e1rm ? (
            <BigNumber
              label="Best estimated 1-rep max"
              value={Number(formatWeight(e1rm.value, units))}
              decimals={Number(formatWeight(e1rm.value, units)) % 1 ? 1 : 0}
              unit={units}
              testID="record-e1rm"
            />
          ) : (
            <BigNumber
              label="Most reps in a set"
              value={mostReps?.reps ?? 0}
              unit="reps"
              testID="record-reps-hero"
            />
          )}
          <View style={{ gap: t.spacing.xs }}>
            {heaviest ? (
              <Stat
                label="Heaviest set"
                value={`${formatWeight(heaviest.weightKg, units)} ${units} × ${heaviest.reps}`}
                testID="record-heaviest"
              />
            ) : null}
            {mostReps && e1rm ? (
              <Stat label="Most reps" value={`${mostReps.reps}`} testID="record-reps" />
            ) : null}
            {sessionVolume ? (
              <Stat
                label="Best session volume"
                value={`${displayVolume(sessionVolume.value, units).toLocaleString('en-US')} ${units}`}
                testID="record-volume"
              />
            ) : null}
          </View>
        </View>
      </Card>
      <View style={{ gap: t.spacing.xs }}>
        <Text variant="headline" accessibilityRole="header">
          Recent sessions
        </Text>
        {sessions.map((s) => (
          <View
            key={s.sessionId}
            accessible
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              gap: t.spacing.sm,
              minHeight: t.sizes.touch,
              alignItems: 'center',
              borderBottomWidth: t.sizes.hairline,
              borderBottomColor: t.colors.border,
            }}
            testID={`history-${s.sessionId}`}
          >
            <View style={{ flexShrink: 1 }}>
              <Text variant="body">{friendlyDate(s.date, today)}</Text>
              <Text variant="callout" color="textSecondary">
                {s.sets === 1 ? '1 set' : `${s.sets} sets`}
              </Text>
            </View>
            {s.top ? (
              <Text variant="body" tabular>
                {s.top.weightKg > 0
                  ? `${formatWeight(s.top.weightKg, units)} ${units} × ${s.top.reps}`
                  : `${s.top.reps} reps`}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}
