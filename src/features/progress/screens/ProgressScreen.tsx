import { Image } from 'expo-image';
import { router } from 'expo-router';
import {
  BarChart3,
  Camera,
  ChartLine,
  ChevronRight,
  CircleAlert,
  Dumbbell,
  Flame,
  Gift,
  History,
  Lock,
  Scale,
  Trophy,
} from 'lucide-react-native';
import { useMemo, useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { usePro } from '@/features/billing/hooks/usePro';
import { BodyHeatmap, bestView } from '@/features/library';
import { BigNumber, Button, Card, EmptyState, ListRow, PressableScale, Screen, Text } from '@/ui';
import { useTheme } from '@/theme';

import { MonthCalendar } from '../components/MonthCalendar';
import { HomeSkeleton } from '../components/Skeletons';
import { Sparkline } from '../components/Sparkline';
import { SectionTitle, Stat, Stagger } from '../components/bits';
import { useNow, useNutrition, useToday, useTraining, useUnits } from '../hooks/useProgress';
import { weightSeries } from '../logic/body';
import {
  inMonth,
  monthName,
  monthOf,
  sameMonth,
  shiftMonth,
  shortDate,
  type MonthKey,
} from '../logic/dates';
import { addDays, type Muscle } from '../logic/engine';
import { isMonthLocked, recoveryTeaser, wrappedTeaser } from '../logic/home';
import { muscleLabel, rankMuscles, recoveryHeatmap } from '../logic/muscles';
import { personalRecords, type PersonalRecord } from '../logic/strength';
import { storyColors } from '../logic/storyColors';
import { monthCalendar, weekStreak, workoutsThisWeek } from '../logic/streak';
import { formatLoad, formatWeight, weightUnit } from '../logic/units';
import { doneSessions, sessionDate, tonnage } from '../logic/workouts';
import { monthlyWrapped } from '../logic/wrapped';
import { useLiveBody, useLivePhotos } from '../repo';
import { resolvePhotoUri } from '../services/photoStore';

/** S29 Progress home. "Try again" remounts the live queries. */
export function ProgressScreen() {
  const [attempt, setAttempt] = useState(0);
  return <ProgressHome key={attempt} onRetry={() => setAttempt((a) => a + 1)} />;
}

/** Streak, calendar, PR rail, visual tiles (weight, recovery, photo, Wrapped), then a short list. */
function ProgressHome({ onRetry }: { onRetry: () => void }) {
  const t = useTheme();
  const today = useToday();
  const now = useNow();
  const units = useUnits();
  const { isPro } = usePro();
  const training = useTraining();
  const nutrition = useNutrition();
  const body = useLiveBody();
  const photos = useLivePhotos();
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
  const heat = useMemo(
    () => recoveryHeatmap(training.sets, training.exById, now),
    [training.sets, training.exById, now],
  );
  const worked = useMemo(() => rankMuscles(heat).filter((r) => r.sets > 0), [heat]);
  const current = monthOf(today);
  const wrapped = useMemo(() => {
    const logs = nutrition.logs.filter((l) => inMonth(l.date, current));
    return monthlyWrapped(
      {
        sessions: training.sessions,
        sets: training.sets,
        exById: training.exById,
        mealsLogged: logs.length,
        loggedDates: logs.map((l) => l.date),
        today,
      },
      current,
    );
    // `current` is derived from `today`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [training.sessions, training.sets, training.exById, nutrition.logs, today]);

  const loading = training.loading || body.loading;
  const error = training.error ?? body.error ?? nutrition.error;
  const empty =
    !loading && workoutDates.length === 0 && body.data.length === 0 && nutrition.logs.length === 0;
  const canNext = !sameMonth(month, current);
  const locked = isMonthLocked(month, current, isPro);

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
        <HomeSkeleton />
      ) : error ? (
        <EmptyState
          icon={CircleAlert}
          title="Progress didn't load"
          body="Your data is safe on this phone."
          actionLabel="Try again"
          onAction={onRetry}
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
              <StreakCard
                current={streak.current}
                longest={streak.longest}
                thisWeekDone={streak.thisWeekDone}
                week={workoutsThisWeek(workoutDates, today)}
                volume={formatLoad(volume7d, units)}
                prs30={prs30}
              />
            </Stagger>
          )}

          <Stagger index={1}>
            <MonthCalendar
              month={month}
              rows={rows}
              onPrev={() => setMonth((m) => shiftMonth(m, -1))}
              onNext={() => setMonth((m) => shiftMonth(m, 1))}
              canNext={canNext}
              locked={locked ? <LockedMonth month={month} /> : undefined}
            />
          </Stagger>

          {prs.length > 0 ? (
            <Stagger index={2}>
              <SectionTitle title="Recent PRs" />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginHorizontal: -t.spacing.screen, marginTop: t.spacing.xs }}
                contentContainerStyle={{ paddingHorizontal: t.spacing.screen, gap: t.spacing.sm }}
                testID="pr-rail"
              >
                {prs.slice(0, 6).map((p, i) => (
                  <PrCard
                    key={`${p.exerciseId}-${p.sessionId}`}
                    pr={p}
                    name={training.exerciseName(p.exerciseId)}
                    value={
                      p.kind === 'weight'
                        ? `${formatWeight(p.valueKg, units)} × ${p.reps}`
                        : `e1RM ${formatWeight(p.valueKg, units)}`
                    }
                    testID={`pr-${i}`}
                  />
                ))}
              </ScrollView>
            </Stagger>
          ) : null}

          <Stagger index={3}>
            <SectionTitle title="At a glance" />
            <View style={{ gap: t.spacing.sm, marginTop: t.spacing.xs }}>
              <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
                <Tile
                  title="Weight"
                  value={weight.current != null ? `${weight.current} ${weightUnit(units)}` : '—'}
                  caption={weight.current != null ? '7-day average' : 'Log a weigh-in'}
                  icon={Scale}
                  onPress={() => router.push('/progress/body')}
                  accessibilityLabel={`Body. ${weight.current != null ? `Weight ${weight.current} ${weightUnit(units)}, 7-day average` : 'No weigh-ins yet'}`}
                  testID="nav-body"
                >
                  {weight.points.length > 1 ? (
                    <Sparkline
                      values={weight.points.slice(-30).map((p) => p.avg)}
                      testID="home-weight-spark"
                    />
                  ) : null}
                </Tile>
                <Tile
                  title="Recovery"
                  value={recoveryTeaser(worked.length)}
                  caption={
                    worked[0]
                      ? `Most worked: ${muscleLabel(worked[0].muscle)}`
                      : 'Train to light it up'
                  }
                  icon={undefined}
                  onPress={() => router.push('/progress/heatmap')}
                  accessibilityLabel={`Muscle recovery. ${recoveryTeaser(worked.length)}`}
                  testID="nav-heatmap"
                >
                  <MiniHeat heat={heat} worked={worked.map((w) => w.muscle)} />
                </Tile>
              </View>
              <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
                <PhotoTile
                  uri={resolvePhotoUri(photos.data[0]?.localUri ?? null)}
                  date={photos.data[0]?.date ?? null}
                />
                <WrappedTile
                  title={`${monthName(current.month)} Wrapped`}
                  line={wrappedTeaser(wrapped)}
                />
              </View>
            </View>
          </Stagger>

          <Stagger index={4}>
            <View>
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
                icon={BarChart3}
                title="Trends"
                subtitle="Volume, adherence and calories"
                chevron
                divider
                onPress={() => router.push('/progress/trends')}
                testID="nav-trends"
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

function StreakCard({
  current,
  longest,
  thisWeekDone,
  week,
  volume,
  prs30,
}: {
  current: number;
  longest: number;
  thisWeekDone: boolean;
  week: number;
  volume: string;
  prs30: number;
}) {
  const t = useTheme();
  const disc = t.sizes.hitGymLarge;
  return (
    <Card testID="progress-streak">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
        <View style={{ flex: 1 }}>
          <BigNumber
            value={current}
            unit={current === 1 ? 'week' : 'weeks'}
            label="Streak"
            testID="streak-number"
          />
          <Text variant="callout" color="textSecondary">
            {thisWeekDone
              ? 'This week counts. Keep it rolling.'
              : current > 0
                ? 'One workout this week keeps it going.'
                : 'One workout this week starts a streak.'}
          </Text>
        </View>
        <View
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={{
            width: disc,
            height: disc,
            borderRadius: t.radius.pill,
            backgroundColor: current > 0 ? t.colors.accent : t.colors.surface2,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Flame
            size={t.sizes.icon}
            color={current > 0 ? t.colors.onAccent : t.colors.textSecondary}
            strokeWidth={t.sizes.iconStrokeBold}
          />
        </View>
      </View>
      <View style={{ flexDirection: 'row', marginTop: t.spacing.md, gap: t.spacing.md }}>
        <Stat label="This week" value={`${week} workouts`} testID="stat-week" />
        <Stat label="Volume 7 days" value={volume} testID="stat-volume" />
        <Stat label="PRs 30 days" value={String(prs30)} testID="stat-prs" />
      </View>
      <Text variant="caption" color="textSecondary" style={{ marginTop: t.spacing.xs }}>
        {`Longest streak ${longest} ${longest === 1 ? 'week' : 'weeks'}`}
      </Text>
    </Card>
  );
}

/** Free users see older months as a calm locked state, not a sudden paywall jump. */
function LockedMonth({ month }: { month: MonthKey }) {
  const t = useTheme();
  return (
    <View
      testID="progress-month-locked"
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
        onPress={() => router.push('/paywall')}
        testID="progress-month-unlock"
      />
    </View>
  );
}

function PrCard({
  pr,
  name,
  value,
  testID,
}: {
  pr: PersonalRecord;
  name: string;
  value: string;
  testID: string;
}) {
  const t = useTheme();
  const disc = t.spacing.xxxl;
  return (
    <PressableScale
      onPress={() => router.push(`/progress/exercise/${pr.exerciseId}`)}
      accessibilityRole="button"
      accessibilityLabel={`New record, ${name}, ${value}, ${shortDate(pr.date)}`}
      testID={testID}
      style={{
        width: t.sizes.ringHero - t.spacing.xxxl,
        padding: t.spacing.card,
        gap: t.spacing.sm,
        borderRadius: t.radius.card,
        backgroundColor: t.colors.inverse,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View
          style={{
            width: disc,
            height: disc,
            borderRadius: t.radius.pill,
            backgroundColor: t.colors.accentOnInverse,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Trophy
            size={t.sizes.iconMedium}
            color={t.colors.inverse}
            strokeWidth={t.sizes.iconStrokeBold}
          />
        </View>
        <Text variant="caption" color="onInverse">
          {shortDate(pr.date)}
        </Text>
      </View>
      <Text variant="title2" color="onInverse" tabular numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text variant="callout" color="onInverse" numberOfLines={2}>
        {name}
      </Text>
    </PressableScale>
  );
}

/** Square-ish home tile: title, glanceable value, caption and a visual. */
function Tile({
  title,
  value,
  caption,
  icon: Icon,
  onPress,
  accessibilityLabel,
  testID,
  children,
}: {
  title: string;
  value: string;
  caption: string;
  icon?: typeof Scale;
  onPress: () => void;
  accessibilityLabel: string;
  testID: string;
  children?: ReactNode;
}) {
  const t = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={{
        flex: 1,
        minHeight: t.sizes.ringHero - t.spacing.xxxl,
        padding: t.spacing.card,
        borderRadius: t.radius.card,
        backgroundColor: t.colors.surface,
        gap: t.spacing.xs,
        justifyContent: 'space-between',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xxs }}>
        {Icon ? (
          <Icon
            size={t.sizes.iconSmall}
            color={t.colors.textSecondary}
            strokeWidth={t.sizes.iconStroke}
          />
        ) : null}
        <Text variant="callout" color="textSecondary" style={{ flex: 1 }}>
          {title}
        </Text>
        <ChevronRight
          size={t.sizes.iconSmall}
          color={t.colors.textSecondary}
          strokeWidth={t.sizes.iconStroke}
        />
      </View>
      {children}
      <View>
        <Text variant="headline" tabular numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        <Text variant="caption" color="textSecondary" numberOfLines={2}>
          {caption}
        </Text>
      </View>
    </PressableScale>
  );
}

function MiniHeat({
  heat,
  worked,
}: {
  heat: Parameters<typeof BodyHeatmap>[0]['heat'];
  worked: Muscle[];
}) {
  const t = useTheme();
  const view = useMemo(() => bestView(worked.slice(0, 3), worked.slice(3)), [worked]);
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <BodyHeatmap
        heat={heat}
        view={view}
        height={t.sizes.ring - t.spacing.md}
        accessibilityLabel=""
        testID="home-heat"
      />
    </View>
  );
}

function PhotoTile({ uri, date }: { uri: string | null; date: string | null }) {
  const t = useTheme();
  return (
    <PressableScale
      onPress={() => router.push('/progress/photos')}
      accessibilityRole="button"
      accessibilityLabel={
        date ? `Progress photos, latest ${shortDate(date)}` : 'Progress photos, add your first'
      }
      testID="nav-photos"
      style={{
        flex: 1,
        minHeight: t.sizes.ringHero - t.spacing.xxxl,
        borderRadius: t.radius.card,
        backgroundColor: t.colors.surface,
        overflow: 'hidden',
        justifyContent: 'flex-end',
      }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          contentFit="cover"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          testID="home-photo"
        />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Camera
            size={t.sizes.icon}
            color={t.colors.textSecondary}
            strokeWidth={t.sizes.iconStroke}
          />
        </View>
      )}
      <View style={{ padding: t.spacing.sm }}>
        <View
          style={{
            alignSelf: 'flex-start',
            backgroundColor: t.colors.inverse,
            borderRadius: t.radius.pill,
            paddingHorizontal: t.spacing.sm,
            paddingVertical: t.spacing.xxs,
          }}
        >
          <Text variant="caption" color="onInverse">
            {date ? `Photos · ${shortDate(date)}` : 'Progress photos'}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}

/** Wrapped teaser in the first story colour, so the home previews the story. */
function WrappedTile({ title, line }: { title: string; line: string }) {
  const t = useTheme();
  const col = storyColors(t.colors, 0);
  return (
    <PressableScale
      onPress={() => router.push('/progress/wrapped')}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${line}`}
      testID="nav-wrapped"
      style={{
        flex: 1,
        minHeight: t.sizes.ringHero - t.spacing.xxxl,
        padding: t.spacing.card,
        borderRadius: t.radius.card,
        backgroundColor: col.bg,
        justifyContent: 'space-between',
      }}
    >
      <Gift size={t.sizes.icon} color={col.fg} strokeWidth={t.sizes.iconStrokeBold} />
      <View style={{ gap: t.spacing.xxs }}>
        <Text variant="headline" style={{ color: col.fg }}>
          {title}
        </Text>
        <Text variant="caption" style={{ color: col.fg }} numberOfLines={2}>
          {line}
        </Text>
      </View>
    </PressableScale>
  );
}
