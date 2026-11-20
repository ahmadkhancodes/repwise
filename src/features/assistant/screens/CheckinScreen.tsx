import { router, type Href } from 'expo-router';
import { ArrowRight, CalendarCheck, ChevronLeft, CircleAlert, CircleCheck, Dumbbell, Lock, UtensilsCrossed } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, Platform, View } from 'react-native';
import Animated, { FadeInRight, useReducedMotion, ZoomIn } from 'react-native-reanimated';

import { usePro } from '@/features/billing';
import { latestWeight } from '@/features/progress/repo';
import { getProfile } from '@/features/settings/repo';
import { localDate } from '@/features/today/logic/day';
import { addDays, type ISODate } from '@/features/today/logic/engine';
import { useDbSnapshot, useNow } from '@/features/today/hooks/useDbSnapshot';
import { getPlanner } from '@/features/today/plannerBridge';
import { track } from '@/services/analytics';
import { haptics } from '@/services/haptics';
import { useTheme } from '@/theme';
import { Badge, BigNumber, Button, Card, Chip, EmptyState, goBack, IconButton, ProgressRing, Screen, Skeleton, SkeletonGroup, SkeletonText, Sparkline, Stepper, StepProgress, Text } from '@/ui';

import {
  appliesFrom,
  CHECKIN_STEPS,
  computeCheckin,
  deltaLabel,
  displayWeight,
  ENERGY_OPTIONS,
  floorFor,
  kcalChangeBucket,
  share,
  SLEEP_OPTIONS,
  toKg,
  VOLUME_COPY,
  weeklyAdherence,
  weighInsFor,
  type CheckinResult,
  type Energy,
  type Sleep,
} from '../logic/checkin';
import {
  currentKcalTarget,
  deloadRequested,
  saveCheckin,
  saveWeighIn,
  setDeloadRequested,
  weekActivity,
  weightsSince,
  type CheckinRecord,
} from '../repo';

const TABLES = ['profile', 'body_metrics', 'sessions', 'meals', 'meal_plans', 'cards'] as const;

function loadCheckin(today: ISODate) {
  const profile = getProfile();
  return {
    profile,
    weights: weightsSince(addDays(today, -13)),
    latestKg: latestWeight()?.weightKg ?? profile?.weightKg ?? null,
    activity: weekActivity(today),
    kcal: currentKcalTarget(today),
    deload: deloadRequested(today),
  };
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/** S28 weekly check-in: weigh-in → energy/sleep → your week → adjustments → approve (flow F4). */
export function CheckinScreen({ now: nowOverride }: { now?: number } = {}) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const now = useNow(60_000, nowOverride);
  const today = localDate(now);
  const { isPro } = usePro(nowOverride);
  const { data, error, reload } = useDbSnapshot(TABLES, () => loadCheckin(today), [today]);

  const imperial = data?.profile?.units === 'imperial';
  const [step, setStep] = useState(0);
  const [weight, setWeight] = useState<number | null>(null);
  const [weighed, setWeighed] = useState(true);
  const [energy, setEnergy] = useState<Energy | null>(null);
  const [sleep, setSleep] = useState<Sleep | null>(null);
  const [done, setDone] = useState<CheckinResult | null>(null);

  // The weigh-in starts at the latest weight until the user changes it.
  const latestKg = data?.latestKg ?? null;
  const shownWeight = weight ?? (latestKg != null ? displayWeight(latestKg, imperial) : null);

  const result = useMemo(() => {
    if (!data?.profile || !energy || !sleep) return null;
    const p = data.profile;
    const floor = floorFor(p, today);
    const todayKg = weighed && shownWeight != null ? toKg(shownWeight, imperial) : null;
    const meals = data.activity.meals.map((m) => ({ date: m.date, status: m.status }));
    return computeCheckin({
      onDate: today,
      goal: p.goal,
      currentKcal: data.kcal ?? floor,
      floor,
      weighIns: weighInsFor(today, data.weights, todayKg),
      adherence: weeklyAdherence(today, data.activity.sessions, meals),
      energy,
      sleep,
      deloadRequested: data.deload,
    });
  }, [data, energy, sleep, weighed, shownWeight, imperial, today]);

  const back = useCallback(() => {
    if (step > 0 && !done) {
      haptics.selection();
      setStep((s) => s - 1);
      return true;
    }
    goBack();
    return true;
  }, [step, done]);

  useEffect(() => {
    if (Platform.OS !== 'android' || step === 0 || done) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', back);
    return () => sub.remove();
  }, [back, step, done]);

  const approve = useCallback(() => {
    if (!result || !energy || !sleep) return;
    const hasKcal = data?.kcal != null;
    const delta = hasKcal ? result.adjustment.deltaKcal : 0;
    if (weighed && shownWeight != null) saveWeighIn(today, toKg(shownWeight, imperial));
    const from = appliesFrom(today);
    const rec: CheckinRecord = {
      energy,
      sleep,
      weighedIn: weighed && shownWeight != null,
      deltaKcal: delta,
      newKcal: hasKcal ? result.after.kcal : 0,
      volume: result.volume,
      appliesFrom: from,
      applied: false,
    };
    saveCheckin(today, rec);
    setDeloadRequested(null);
    track('checkin_done', { kcal_change_bucket: kcalChangeBucket(delta) });
    haptics.success();
    setDone(result);
    // Rebuild the week in the background; the check-in is already saved locally.
    const regen = getPlanner().regenerateWeek;
    if (regen) {
      regen({ weekStart: from, adjustmentKcal: delta, volume: result.volume })
        .then(() => saveCheckin(today, { ...rec, applied: true }))
        .catch(() => undefined);
    }
  }, [result, energy, sleep, data?.kcal, weighed, shownWeight, imperial, today]);

  const headerLeft = (
    <IconButton icon={ChevronLeft} accessibilityLabel={step > 0 && !done ? 'Previous step' : 'Back'} onPress={back} testID="checkin-back" />
  );

  if (!isPro) {
    return (
      <Screen title="Weekly check-in" headerLeft={headerLeft} testID="screen-checkin">
        <EmptyState
          icon={Lock}
          title="Weekly check-in is part of Pro"
          body="Each week Repwise tunes your calories, training volume and menus from your own progress."
          actionLabel="See Repwise Pro"
          onAction={() => router.push({ pathname: '/paywall', params: { source: 'checkin' } } as Href)}
          testID="checkin-pro"
        />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen title="Weekly check-in" headerLeft={headerLeft} testID="screen-checkin">
        <EmptyState icon={CircleAlert} title="Couldn’t load your week" body="Your data is safe on this phone." actionLabel="Try again" onAction={reload} testID="checkin-error" />
      </Screen>
    );
  }

  if (!data) {
    return (
      <Screen title="Weekly check-in" headerLeft={headerLeft} testID="screen-checkin">
        <SkeletonGroup label="Loading your week" testID="checkin-loading" style={{ gap: t.spacing.md }}>
          <Skeleton height={t.spacing.xxs} radius={t.radius.pill} />
          <SkeletonText variant="title2" lines={2} lastLineWidth="50%" />
          <Skeleton height={t.sizes.button * 2} radius={t.radius.card} />
        </SkeletonGroup>
      </Screen>
    );
  }

  if (!data.profile?.onboardedAt) {
    return (
      <Screen title="Weekly check-in" headerLeft={headerLeft} testID="screen-checkin">
        <EmptyState
          icon={CalendarCheck}
          title="Check-ins start after week one"
          body="Build your plan first. Your first check-in is due a week later."
          actionLabel="Build my plan"
          onAction={() => router.push('/(onboarding)/welcome' as Href)}
          testID="checkin-onboard"
        />
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen
        title="You’re set"
        testID="screen-checkin"
        footer={<Button label="Back to Today" onPress={() => router.back()} testID="checkin-finish" />}
      >
        <View style={{ alignItems: 'center', gap: t.spacing.md, paddingTop: t.spacing.xxl }} testID="checkin-done">
          <Animated.View entering={reduceMotion ? undefined : ZoomIn.springify().damping(t.motion.spring.damping).stiffness(t.motion.spring.stiffness)}>
            <View style={{ width: t.sizes.ring, height: t.sizes.ring, borderRadius: t.radius.pill, backgroundColor: t.colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <CircleCheck color={t.colors.accentText} size={t.sizes.touch} strokeWidth={t.sizes.iconStroke} />
            </View>
          </Animated.View>
          <Text variant="title2" align="center">
            Next week is planned around you
          </Text>
          <Text variant="body" color="textSecondary" align="center">
            New targets apply from Monday. {VOLUME_COPY[done.volume].detail}
          </Text>
        </View>
      </Screen>
    );
  }

  const current = CHECKIN_STEPS[step] ?? 'weigh';
  const canNext = current === 'feel' ? energy !== null && sleep !== null : current === 'weigh' ? !weighed || shownWeight !== null : result !== null;
  const footer =
    current === 'adjust' ? (
      <Button label="Approve" onPress={approve} disabled={!result} testID="checkin-approve" />
    ) : (
      <>
        <Button
          label="Next"
          icon={ArrowRight}
          disabled={!canNext || !data}
          onPress={() => setStep((s) => s + 1)}
          testID="checkin-next"
        />
        {current === 'weigh' ? (
          <Button
            label="Skip, use my trend"
            variant="tertiary"
            onPress={() => {
              setWeighed(false);
              setStep(1);
            }}
            testID="checkin-skip-weight"
          />
        ) : null}
      </>
    );

  const enter = reduceMotion ? undefined : FadeInRight.springify().damping(t.motion.spring.damping).stiffness(t.motion.spring.stiffness);
  const unit = imperial ? 'lb' : 'kg';
  const kcalKnown = data?.kcal != null;

  return (
    <Screen title="Weekly check-in" headerLeft={headerLeft} footer={footer} testID="screen-checkin">
      <StepProgress
        total={CHECKIN_STEPS.length}
        current={step}
        accessibilityLabel={`Step ${step + 1} of ${CHECKIN_STEPS.length}`}
        testID="checkin-progress"
      />
      <Animated.View key={current} entering={enter} style={{ gap: t.spacing.md }}>
        {current === 'weigh' ? (
          <View style={{ gap: t.spacing.md }} testID="checkin-step-weigh">
            <Text variant="title2">Weigh-in</Text>
            <Text variant="body" color="textSecondary">
              Morning, before breakfast, is most consistent. The trend matters, not one day.
            </Text>
            {shownWeight !== null ? (
              <>
                {/* One weight control: the large Stepper (hold to repeat, tap the number to type). */}
                <Stepper
                  size="large"
                  label="Weight"
                  value={shownWeight}
                  onChange={(v) => {
                    setWeighed(true);
                    setWeight(v);
                  }}
                  step={0.1}
                  min={imperial ? 66 : 30}
                  max={imperial ? 880 : 400}
                  unit={unit}
                  format={(v) => v.toFixed(1)}
                  testID="checkin-weight"
                />
              </>
            ) : (
              <Button label="Add today’s weight" variant="secondary" onPress={() => setWeight(imperial ? 165 : 75)} testID="checkin-add-weight" />
            )}
          </View>
        ) : null}

        {current === 'feel' ? (
          <View style={{ gap: t.spacing.lg }} testID="checkin-step-feel">
            <Text variant="title2">How did the week feel?</Text>
            <View style={{ gap: t.spacing.xs }}>
              <Text variant="headline">Energy</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs }} accessibilityRole="radiogroup">
                {ENERGY_OPTIONS.map((o) => (
                  <Chip key={o.value} role="radio" label={o.label} selected={energy === o.value} onPress={() => setEnergy(o.value)} testID={`energy-${o.value}`} />
                ))}
              </View>
            </View>
            <View style={{ gap: t.spacing.xs }}>
              <Text variant="headline">Sleep</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs }} accessibilityRole="radiogroup">
                {SLEEP_OPTIONS.map((o) => (
                  <Chip key={o.value} role="radio" label={o.label} selected={sleep === o.value} onPress={() => setSleep(o.value)} testID={`sleep-${o.value}`} />
                ))}
              </View>
            </View>
          </View>
        ) : null}

        {current === 'week' && result ? (
          <View style={{ gap: t.spacing.md }} testID="checkin-step-week">
            <Text variant="title2">Your week</Text>
            <Card>
              <Text variant="eyebrow" color="textSecondary">
                Weight trend
              </Text>
              {result.trend.length > 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: t.spacing.md, marginTop: t.spacing.xs }}>
                  <View style={{ flex: 1 }}>
                    <BigNumber
                      value={displayWeight(result.trend[result.trend.length - 1]!.avgKg, imperial)}
                      decimals={1}
                      unit={unit}
                      label="7-day average"
                      testID="checkin-trend"
                    />
                    <Text variant="callout" color="textSecondary" tabular testID="checkin-trend-change">
                      {result.adjustment.trendKgPerWeek == null
                        ? 'More weigh-ins needed for a trend'
                        : `${result.adjustment.trendKgPerWeek <= 0 ? '−' : '+'}${displayWeight(Math.abs(result.adjustment.trendKgPerWeek), imperial).toFixed(1)} ${unit} vs last week`}
                    </Text>
                  </View>
                  <Sparkline values={result.trend.map((p) => p.avgKg)} width={t.sizes.ring} height={t.sizes.touch} />
                </View>
              ) : (
                <Text variant="body" color="textSecondary" testID="checkin-no-weights">
                  No weigh-ins yet. Calories stay as they are this week.
                </Text>
              )}
            </Card>
            <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
              {[
                { key: 'workouts', label: 'Workouts', done: result.adherence.workoutsDone, of: result.adherence.workoutsPlanned },
                { key: 'meals', label: 'Meals', done: result.adherence.mealsEaten, of: result.adherence.mealsPlanned },
              ].map((a) => (
                <Card key={a.key} style={{ flex: 1, alignItems: 'center', gap: t.spacing.xs }} testID={`checkin-${a.key}`}>
                  <ProgressRing progress={share(a.done, a.of) ?? 0} size={t.sizes.touch + t.spacing.lg} strokeWidth={t.spacing.xs} accessibilityLabel={`${a.label} done`}>
                    <Text variant="callout" tabular>
                      {a.of > 0 ? `${Math.round((share(a.done, a.of) ?? 0) * 100)}%` : '—'}
                    </Text>
                  </ProgressRing>
                  <Text variant="callout" color="textSecondary" tabular>
                    {a.label} {a.done}/{a.of}
                  </Text>
                </Card>
              ))}
            </View>
            <Text variant="body" testID="checkin-summary">
              {result.summary}
            </Text>
          </View>
        ) : null}

        {current === 'adjust' && result ? (
          <View style={{ gap: t.spacing.md }} testID="checkin-step-adjust">
            <Text variant="title2">Next week</Text>
            <Card testID="checkin-kcal">
              <Text variant="eyebrow" color="textSecondary">
                Daily calories
              </Text>
              {kcalKnown ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, marginTop: t.spacing.xs }}>
                    <Text variant="title2" color="textSecondary" tabular style={{ textDecorationLine: result.adjustment.deltaKcal ? 'line-through' : 'none' }} testID="kcal-before">
                      {fmt(result.before.kcal)}
                    </Text>
                    <ArrowRight color={t.colors.textSecondary} size={t.sizes.icon} strokeWidth={t.sizes.iconStroke} />
                    <BigNumber value={result.after.kcal} unit="kcal" testID="kcal-after" />
                  </View>
                  <Badge
                    label={deltaLabel(result.adjustment.deltaKcal)}
                    tone={result.adjustment.deltaKcal ? 'accent' : 'neutral'}
                    style={{ alignSelf: 'flex-start', marginTop: t.spacing.xs }}
                    testID="kcal-delta"
                  />
                </>
              ) : (
                <Text variant="body" color="textSecondary" style={{ marginTop: t.spacing.xs }}>
                  Your calorie target is set with your meal plan.
                </Text>
              )}
            </Card>
            <Card testID="checkin-volume">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                <Dumbbell color={t.colors.textPrimary} size={t.sizes.icon} strokeWidth={t.sizes.iconStroke} />
                <View style={{ flex: 1 }}>
                  <Text variant="eyebrow" color="textSecondary">
                    Training
                  </Text>
                  <Text variant="headline">{VOLUME_COPY[result.volume].title}</Text>
                  <Text variant="callout" color="textSecondary">
                    {VOLUME_COPY[result.volume].detail}
                  </Text>
                </View>
              </View>
            </Card>
            <Card testID="checkin-menus">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                <UtensilsCrossed color={t.colors.textPrimary} size={t.sizes.icon} strokeWidth={t.sizes.iconStroke} />
                <View style={{ flex: 1 }}>
                  <Text variant="eyebrow" color="textSecondary">
                    Menus
                  </Text>
                  <Text variant="headline">Fresh menus</Text>
                  <Text variant="callout" color="textSecondary">
                    New dishes for the week, with a grocery list to match.
                  </Text>
                </View>
              </View>
            </Card>
          </View>
        ) : null}
      </Animated.View>
    </Screen>
  );
}
