import { router } from 'expo-router';
import {
  Activity,
  BarChart3,
  Camera,
  ChartLine,
  CircleAlert,
  Dumbbell,
  Flame,
  History,
  Scale,
  Sparkles,
  Trophy,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { usePro } from '@/features/billing/hooks/usePro';
import { BigNumber, Button, Card, EmptyState, ListRow, Screen, Text } from '@/ui';
import { useTheme } from '@/theme';

import { MonthCalendar } from '../components/MonthCalendar';
import { ProgressSkeleton } from '../components/Skeleton';
import { SectionTitle, Stat, Stagger } from '../components/bits';
import { useNutrition, useToday, useTraining, useUnits } from '../hooks/useProgress';
import { weightSeries } from '../logic/body';
import { monthOf, sameMonth, shiftMonth, shortDate, type MonthKey } from '../logic/dates';
import { addDays } from '../logic/engine';
import { personalRecords } from '../logic/strength';
import { monthCalendar, weekStreak, workoutsThisWeek } from '../logic/streak';
import { formatLoad, formatWeight, weightUnit } from '../logic/units';
import { doneSessions, sessionDate, tonnage } from '../logic/workouts';
import { useLiveBody } from '../repo';

/** S29 Progress home: streak, calendar, highlights, PRs and the doors into every progress view. */
export function ProgressScreen() {
  const t = useTheme();
  const today = useToday();
  const units = useUnits();
  const { isPro } = usePro();
  const training = useTraining();
  const nutrition = useNutrition();
  const body = useLiveBody();
  const [month, setMonth] = useState<MonthKey>(() => monthOf(today));

  const workoutDates = useMemo(
    () =>
      doneSessions(training.sessions)
        .map(sessionDate)
        .filter((d): d is string => d != null),
    [training.sessions],
  );
  const streak = useMemo(() => weekStreak(workoutDates, today), [workoutDates, today]);
  const rows = useMemo(
    () =>
      monthCalendar(
        month,
        new Set(workoutDates),
        new Set(nutrition.logs.map((l) => l.date)),
        today,
      ),
    [month, workoutDates, nutrition.logs, today],
  );
  const prs = useMemo(() => personalRecords(training.sets), [training.sets]);
  const weekFrom = addDays(today, -6);
  const volume7d = useMemo(
    () => tonnage(training.sets.filter((s) => s.date >= weekFrom && s.date <= today)),
    [training.sets, weekFrom, today],
  );
  const prs30 = prs.filter((p) => p.date >= addDays(today, -29)).length;
  const weight = useMemo(
    () => weightSeries(body.data, 'ALL', today, units),
    [body.data, today, units],
  );

  const loading = training.loading || body.loading;
  const error = training.error ?? body.error ?? nutrition.error;
  const empty =
    !loading && workoutDates.length === 0 && body.data.length === 0 && nutrition.logs.length === 0;
  const current = monthOf(today);
  const canNext = !sameMonth(month, current);
  const prevMonth = () => {
    const prev = shiftMonth(month, -1);
    // Free: this month and last month (≈ 30 days of history, RW-50). Pro: everything.
    if (!isPro && prev.year * 12 + prev.month < current.year * 12 + current.month - 1) {
      router.push('/paywall');
      return;
    }
    setMonth(prev);
  };

  return (
    <Screen
      title="Progress"
      edges={['top']}
      testID="screen-progress"
      footer={
        <Button
          label="Log weight"
          icon={Scale}
          onPress={() => router.push('/progress/log')}
          testID="progress-log-weight"
        />
      }
    >
      {loading ? (
        <ProgressSkeleton />
      ) : error ? (
        <EmptyState
          icon={CircleAlert}
          title="Progress didn't load"
          body="Your data is safe on this phone. Try opening Progress again."
          testID="progress-error"
        />
      ) : (
        <>
          {empty ? (
            <EmptyState
              icon={ChartLine}
              title="Your progress starts here"
              body="Finish a workout or log your weight and your streak, records and charts appear here."
              testID="progress-empty"
            />
          ) : (
            <Stagger index={0}>
              <Card testID="progress-streak">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
                  <View style={{ flex: 1 }}>
                    <BigNumber
                      value={streak.current}
                      unit={streak.current === 1 ? 'week' : 'weeks'}
                      label="Streak"
                      testID="streak-number"
                    />
                    <Text variant="callout" color="textSecondary">
                      {streak.thisWeekDone
                        ? 'This week counts. Keep it rolling.'
                        : streak.current > 0
                          ? 'One workout this week keeps it going.'
                          : 'One workout this week starts a streak.'}
                    </Text>
                  </View>
                  <View
                    importantForAccessibility="no-hide-descendants"
                    style={{
                      width: t.sizes.touch + t.spacing.md,
                      height: t.sizes.touch + t.spacing.md,
                      borderRadius: t.radius.pill,
                      backgroundColor: streak.current > 0 ? t.colors.accentSoft : t.colors.surface2,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Flame
                      size={t.sizes.icon}
                      color={streak.current > 0 ? t.colors.accentText : t.colors.textTertiary}
                      strokeWidth={t.sizes.iconStroke}
                    />
                  </View>
                </View>
                <View style={{ flexDirection: 'row', marginTop: t.spacing.md, gap: t.spacing.md }}>
                  <Stat
                    label="This week"
                    value={`${workoutsThisWeek(workoutDates, today)} workouts`}
                    testID="stat-week"
                  />
                  <Stat
                    label="Volume 7 days"
                    value={formatLoad(volume7d, units)}
                    testID="stat-volume"
                  />
                  <Stat label="PRs 30 days" value={String(prs30)} testID="stat-prs" />
                </View>
                <Text variant="caption" color="textTertiary" style={{ marginTop: t.spacing.xs }}>
                  {`Longest streak ${streak.longest} ${streak.longest === 1 ? 'week' : 'weeks'}`}
                </Text>
              </Card>
            </Stagger>
          )}

          <Stagger index={1}>
            <MonthCalendar
              month={month}
              rows={rows}
              onPrev={prevMonth}
              onNext={() => setMonth(shiftMonth(month, 1))}
              canNext={canNext}
            />
          </Stagger>

          {prs.length > 0 ? (
            <Stagger index={2}>
              <SectionTitle title="Recent PRs" />
              <View style={{ marginTop: t.spacing.xs }}>
                {prs.slice(0, 3).map((p, i) => (
                  <ListRow
                    key={`${p.exerciseId}-${p.sessionId}`}
                    icon={Trophy}
                    title={training.exerciseName(p.exerciseId)}
                    subtitle={shortDate(p.date)}
                    value={
                      p.kind === 'weight'
                        ? `${formatWeight(p.valueKg, units)} × ${p.reps}`
                        : `e1RM ${formatWeight(p.valueKg, units)}`
                    }
                    onPress={() => router.push(`/progress/exercise/${p.exerciseId}`)}
                    divider={i < Math.min(prs.length, 3) - 1}
                    testID={`pr-${i}`}
                  />
                ))}
              </View>
            </Stagger>
          ) : null}

          <Stagger index={3}>
            <SectionTitle title="Explore" />
            <View style={{ marginTop: t.spacing.xs }}>
              <ListRow
                icon={Scale}
                title="Body"
                subtitle="Weight trend and measurements"
                value={
                  weight.current != null ? `${weight.current} ${weightUnit(units)}` : undefined
                }
                chevron
                divider
                onPress={() => router.push('/progress/body')}
                testID="nav-body"
              />
              <ListRow
                icon={Dumbbell}
                title="Strength"
                subtitle="1RM, volume and PRs per exercise"
                chevron
                divider
                onPress={() => router.push('/progress/records')}
                testID="nav-records"
              />
              <ListRow
                icon={Activity}
                title="Muscle recovery"
                subtitle="What you worked this week"
                chevron
                divider
                onPress={() => router.push('/progress/heatmap')}
                testID="nav-heatmap"
              />
              <ListRow
                icon={BarChart3}
                title="Trends"
                subtitle="Volume, adherence and calories"
                chevron
                divider
                onPress={() => router.push('/progress/trends')}
                testID="nav-trends"
              />
              <ListRow
                icon={Camera}
                title="Progress photos"
                subtitle="Private to this phone"
                chevron
                divider
                onPress={() => router.push('/progress/photos')}
                testID="nav-photos"
              />
              <ListRow
                icon={Sparkles}
                title="Monthly Wrapped"
                subtitle="Your month as a story"
                chevron
                divider
                onPress={() => router.push('/progress/wrapped')}
                testID="nav-wrapped"
              />
              <ListRow
                icon={History}
                title="History"
                subtitle="Every workout and food day"
                chevron
                onPress={() => router.push('/progress/history')}
                testID="nav-history"
              />
            </View>
          </Stagger>
        </>
      )}
    </Screen>
  );
}
