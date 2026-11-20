import { router, useFocusEffect } from 'expo-router';
import { CalendarCheck, TriangleAlert } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useBillingStore } from '@/services/billing';
import { track } from '@/services/analytics';
import { haptics } from '@/services/haptics';
import { startOfWeek } from '@/features/planner/engine';
import { projectGoalDate } from '@/features/planner/logic/goalDate';
import { generateInitialPlan } from '@/features/planner/planService';
import { planForWeek } from '@/features/planner/repo';
import { getProfile } from '@/features/settings/repo';
import { useTheme } from '@/theme';
import {
  BigNumber,
  Button,
  Card,
  EmptyState,
  ringInnerWidth,
  Screen,
  Skeleton,
  SkeletonCard,
  SkeletonGroup,
  Text,
} from '@/ui';

import { completeOnboarding, deviceContext, trackStep } from '../actions';
import {
  BuildLine,
  BuildRing,
  MealsList,
  TargetsHero,
  WeekStrip,
  WorkoutCard,
} from '../components/RevealParts';
import { usePlanPreview } from '../hooks/usePlanPreview';
import { GOAL_OPTIONS, labelOf } from '../logic/options';
import {
  BUILD_POLL_UNITS,
  BUILD_STEPS,
  formatDay,
  macroShares,
  revealDelay,
  revealReady,
  shortTitle,
  ticksAt,
} from '../logic/reveal';
import { formatWeight } from '../logic/units';
import { useOnboarding } from '../store';

type Status = 'building' | 'ready' | 'error';

/** S07: "Building your plan" (real computation) → the plan reveal (W1) → paywall (if on) → Home. */
const wallClock = () => Date.now();

export function PlanScreen({ clock = wallClock }: { clock?: () => number }) {
  const t = useTheme();
  const ctx = useMemo(() => deviceContext(), []);
  const [status, setStatus] = useState<Status>('building');
  const [ticks, setTicks] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const done = useRef(false);
  const preview = usePlanPreview(ctx.today);
  const paymentsEnabled = useBillingStore((s) => s.paymentsEnabled);

  useFocusEffect(
    useCallback(() => {
      useOnboarding.getState().setPhase('plan');
      trackStep('plan', 0);
    }, []),
  );

  // Build: start the timer-driven lines, then run the real planner after the first frame.
  useEffect(() => {
    let cancelled = false;
    done.current = false;
    const started = clock();
    const timer = setInterval(() => {
      const elapsed = clock() - started;
      setTicks((prev) => {
        const next = ticksAt(elapsed, done.current);
        if (next > prev) haptics.selection();
        return next;
      });
      if (revealReady(elapsed, done.current)) {
        clearInterval(timer);
        if (!cancelled) {
          haptics.success();
          setStatus('ready');
        }
      }
    }, t.motion.listStagger * BUILD_POLL_UNITS);

    (async () => {
      try {
        const existing = planForWeek('training', startOfWeek(ctx.today));
        if (!existing) {
          // The days the user picked in S04 (not a spread from today).
          await generateInitialPlan({
            trainingWeekdays: useOnboarding.getState().answers.trainingWeekdays,
          });
          const p = getProfile();
          track('plan_generated', {
            goal: p?.goal ?? null,
            days: p?.days ?? null,
            diet_type: p?.dietType ?? null,
          });
        }
        done.current = true;
      } catch {
        clearInterval(timer);
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [attempt, ctx.today, clock, t.motion.listStagger]);

  const finish = () => {
    haptics.light();
    completeOnboarding();
    router.replace('/today');
    if (paymentsEnabled) router.push({ pathname: '/paywall', params: { source: 'onboarding' } });
  };

  if (status === 'error') {
    return (
      <Screen testID="screen-plan-error" scroll={false} contentStyle={{ justifyContent: 'center' }}>
        <EmptyState
          icon={TriangleAlert}
          title="We couldn't build your plan"
          body="Your answers are saved on this phone. Try again, or go back and check them."
          actionLabel="Try again"
          onAction={() => {
            setTicks(0);
            setStatus('building');
            setAttempt((a) => a + 1);
          }}
          testID="plan-error"
        />
      </Screen>
    );
  }

  if (status === 'building') {
    const progress = ticks / BUILD_STEPS.length;
    return (
      <Screen testID="screen-plan-building" scroll={false}>
        <View style={{ flex: 1, justifyContent: 'center', gap: t.spacing.xxl }}>
          <BuildRing progress={progress}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <BigNumber
                value={Math.round(progress * 100)}
                unit="%"
                variant="hero"
                fitWidth={ringInnerWidth(t.sizes.ringHero, t.sizes.ringStroke)}
                center
                testID="build-percent"
              />
            </View>
          </BuildRing>
          <View style={{ gap: t.spacing.xs }}>
            <Text variant="title1" align="center" accessibilityRole="header">
              Building your plan
            </Text>
            <Text variant="body" color="textSecondary" align="center">
              From your answers, on this phone.
            </Text>
          </View>
          <View style={{ gap: t.spacing.xxs }} accessibilityLiveRegion="polite">
            {BUILD_STEPS.map((label, i) => (
              <BuildLine
                key={label}
                label={label}
                state={i < ticks ? 'done' : i === ticks ? 'active' : 'todo'}
                testID={`build-step-${i}`}
              />
            ))}
          </View>
        </View>
      </Screen>
    );
  }

  const profile = getProfile();
  const goal = GOAL_OPTIONS.find((o) => o.value === profile?.goal)?.value ?? null;
  const units = profile?.units === 'imperial' ? 'imperial' : 'metric';
  const goalDate =
    goal && profile?.weightKg
      ? projectGoalDate({
          goal,
          weightKg: profile.weightKg,
          targetKg: profile.targetKg,
          today: ctx.today,
        })
      : null;
  const shares = macroShares({ kcal: preview.kcal, ...preview.macros });
  const todayDay = preview.strip.find((d) => d.isToday);
  const next = preview.nextTrainingDay;

  return (
    <Screen
      testID="screen-plan"
      footer={
        <Animated.View
          entering={FadeInDown.delay(revealDelay(t.motion, 'cta'))
            .springify()
            .damping(t.motion.spring.damping)
            .stiffness(t.motion.spring.stiffness)}
        >
          <Button label="Start my plan" onPress={finish} testID="plan-continue" />
        </Animated.View>
      }
    >
      <Animated.View
        entering={FadeInDown.springify()
          .damping(t.motion.spring.damping)
          .stiffness(t.motion.spring.stiffness)}
        style={{ gap: t.spacing.xs, paddingTop: t.spacing.lg }}
      >
        <Text variant="caption" color="accentText">
          YOUR PLAN IS READY
        </Text>
        <Text variant="title1" accessibilityRole="header">
          {labelOf(GOAL_OPTIONS, goal) || 'Your plan'}
        </Text>
        <Text variant="body" color="textSecondary" testID="reveal-goal-line">
          {goalDate && profile?.targetKg
            ? `${formatWeight(profile.targetKg, units)} by ${formatDay(goalDate.date)} at a steady pace`
            : `${profile?.days ?? 3} sessions a week · ${profile?.sessionMin ?? 60} min each`}
        </Text>
      </Animated.View>

      {!preview.ready ? (
        <SkeletonGroup label="Loading your plan" testID="reveal-loading">
          <Skeleton height={t.sizes.ringHero + t.spacing.xxxl * 2} radius={t.radius.card} />
          <Skeleton height={t.sizes.touch + t.spacing.xl} radius={t.radius.card} />
          <SkeletonCard lines={3} />
          <Skeleton height={t.sizes.row} radius={t.radius.card} />
          <Skeleton height={t.sizes.row} radius={t.radius.card} />
        </SkeletonGroup>
      ) : (
        <>
          <TargetsHero
            kcal={preview.kcal}
            macros={preview.macros}
            shares={shares}
            dayType={todayDay?.training ? 'training' : 'rest'}
          />
          {preview.nutrition?.consultProfessional ? (
            <Card testID="reveal-general-plan">
              <Text variant="callout" color="textSecondary">
                We set a general plan that keeps your weight steady. Talk to a health professional
                before aiming to change it.
              </Text>
            </Card>
          ) : null}
          <View style={{ gap: t.spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}>
              <CalendarCheck
                size={t.sizes.iconMedium}
                strokeWidth={t.sizes.iconStroke}
                color={t.colors.textPrimary}
              />
              <Text variant="headline">This week</Text>
            </View>
            <WeekStrip days={preview.strip} />
          </View>
          <WorkoutCard
            title={shortTitle(preview.today.title)}
            minutes={preview.sessionMin}
            count={preview.today.exerciseCount}
            names={preview.today.exerciseNames}
            rest={
              preview.today.title
                ? null
                : {
                    label: next ? `${next.label} ${next.dayOfMonth}` : 'Next week',
                    title: next?.title ?? '',
                  }
            }
          />
          <View style={{ gap: t.spacing.sm }}>
            <Text variant="headline">Today&apos;s meals</Text>
            {preview.meals.length ? (
              <MealsList meals={preview.meals} />
            ) : (
              <Text variant="callout" color="textSecondary" testID="reveal-no-meals">
                Your meals start tomorrow.
              </Text>
            )}
          </View>
        </>
      )}
    </Screen>
  );
}
