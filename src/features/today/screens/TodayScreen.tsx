import { router, useLocalSearchParams, type Href } from 'expo-router';
import { CloudOff, Dumbbell, Settings, Sun } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { AssistantCard } from '@/features/assistant/components/AssistantCard';
import { CardDetailSheet } from '@/features/assistant/components/CardDetailSheet';
import { useAssistant } from '@/features/assistant/hooks/useAssistant';
import type { ShownCard } from '@/features/assistant/logic/cardState';
import { canSwapMeal, openGate, usePro } from '@/features/billing';
import {
  openMeal,
  quickAddWater,
  SwapSheet,
  toggleMeal,
  toMealView,
  type MealView as EatMealView,
} from '@/features/meals';
import { getWaterGoal } from '@/features/nutrition';
import { WaterCard } from '@/features/nutrition/components/WaterCard';
import { trainHref } from '@/features/workout';
import { useCatalogFor } from '@/services/catalog';
import { maybeAskForReview, REVIEW_DELAY_MS } from '@/services/review';
import { useTheme } from '@/theme';
import {
  Button,
  EmptyState,
  IconButton,
  Screen,
  Skeleton,
  SkeletonGroup,
  Text,
  UNDO_TOAST_MS,
} from '@/ui';

import { EveningCard } from '../components/EveningCard';
import { MealsCard } from '../components/MealsCard';
import { StatsGrid } from '../components/StatsGrid';
import { RestDayCard, WorkoutCard } from '../components/WorkoutCard';
import { useDashboard } from '../hooks/useDashboard';
import { useToday } from '../hooks/useToday';
import { localHour } from '../logic/day';
import type { MealView } from '../logic/meals';
import {
  currentWeekStreak,
  isWeekComplete,
  reviewMoment,
  type DayMomentState,
} from '../logic/moments';
import { doneWorkoutDates } from '../repo';

/** Undo window for the core action (P5 acceptance: undo toast, 5 s). */
export const UNDO_MS = UNDO_TOAST_MS;

export const ROUTES = {
  onboarding: '/(onboarding)/welcome' as Href,
  train: '/train' as Href,
  eat: '/eat' as Href,
  progress: '/progress' as Href,
  logWeight: '/progress/log' as Href,
  settings: '/settings' as Href,
  checkin: '/checkin' as Href,
  /** The workout slice's deep link: Train starts (or resumes) the session and opens the player. */
  workout: (sessionId: string) => trainHref(sessionId) as Href,
};

/** Today while the first snapshot loads: the same card rhythm as the real screen. */
function TodaySkeleton() {
  const t = useTheme();
  return (
    <SkeletonGroup label="Loading today" testID="today-skeleton" style={{ gap: t.spacing.md }}>
      <Skeleton height={t.sizes.button * 3} radius={t.radius.card} />
      <Skeleton height={t.sizes.button * 3} radius={t.radius.card} />
      <Skeleton height={t.sizes.ring + t.spacing.card * 2} radius={t.radius.card} />
    </SkeletonGroup>
  );
}

/**
 * Fire a store-review ask on success moments Today detects (week complete, streak milestone),
 * only on a false → true transition while Today is open.
 */
function useReviewMoments(state: DayMomentState | null, today: string) {
  const prev = useRef<DayMomentState | null>(null);
  useEffect(() => {
    if (!state) return;
    const moment = reviewMoment(prev.current, state, () => {
      try {
        return currentWeekStreak(doneWorkoutDates(), today);
      } catch {
        return 0;
      }
    });
    prev.current = state;
    if (!moment) return;
    const id = setTimeout(() => void maybeAskForReview(moment), REVIEW_DELAY_MS);
    return () => clearTimeout(id);
  }, [state, today]);
}

/**
 * S11 Today = the Home dashboard (owner 22 Nov). Order is the hierarchy, gym first: date → the
 * hero (today's workout with Start; the done card or the rest day otherwise) → the stats grid
 * (calories ring, protein, steps, workouts this week, streak, weekly volume, weight trend) → the
 * meal timeline → at most one assistant card → evening recap → water. Start lands above the fold
 * and in the thumb zone at 360×640.
 */
export function TodayScreen({ now: nowOverride }: { now?: number } = {}) {
  const t = useTheme();
  const model = useToday(nowOverride);
  const { isPro } = usePro(nowOverride);
  const catalog = useCatalogFor('recipes');
  const view = model.view;
  const params = useLocalSearchParams<{ card?: string; checkin?: string }>();

  const assistant = useAssistant({
    enabled: view?.state === 'ready',
    today: view?.date ?? '',
    hour: localHour(model.now),
    now: model.now,
    isPro,
    onboardedAt: model.snapshot?.profile?.onboardedAt,
    protein: view?.targets ? { eaten: view.eaten.p, target: view.targets.p } : null,
  });

  const dashboard = useDashboard({
    now: model.now,
    eaten: view?.state === 'ready' ? view.eaten : null,
    targets: view?.state === 'ready' ? (view.targets ?? null) : null,
    week: model.snapshot?.week ?? null,
    units: model.snapshot?.profile?.units,
  });
  const openProgress = useCallback(() => router.push(ROUTES.progress), []);
  const openLogWeight = useCallback(() => router.push(ROUTES.logWeight), []);
  const enableSteps = dashboard.enableSteps;
  const onEnableSteps = useCallback(() => void enableSteps(), [enableSteps]);

  const [swapId, setSwapId] = useState<string | null>(null);
  const [openCard, setOpenCard] = useState<ShownCard | null>(null);
  const [moreCards, setMoreCards] = useState(false);

  // Deep link (notification / S12 route): /today?card=<id> opens that card's detail sheet.
  const cardParam = typeof params.card === 'string' ? params.card : undefined;
  // Deep link contract (N-6 notification, widgets): /today?checkin=1 opens the weekly check-in.
  const checkinParam = params.checkin === '1';
  useEffect(() => {
    if (!checkinParam) return;
    router.setParams({ checkin: undefined });
    router.push(ROUTES.checkin);
  }, [checkinParam]);
  const linkedCard = cardParam ? (assistant.cards.find((c) => c.id === cardParam) ?? null) : null;
  const detailCard = openCard ?? linkedCard;

  const weekComplete = isWeekComplete(model.snapshot?.week);
  const ready = view?.state === 'ready';
  const moments = useMemo<DayMomentState | null>(
    () => (ready ? { weekComplete } : null),
    [ready, weekComplete],
  );
  useReviewMoments(moments, view?.date ?? '');

  // Meal writes go through the meals domain (same action, copy and undo as Eat). The row owns the
  // one haptic; the undo toast is silent.
  const dayMeals = view?.meals;
  const onToggle = useCallback(
    (meal: MealView) => {
      toggleMeal(meal, dayMeals ?? []);
    },
    [dayMeals],
  );
  const onSwap = useCallback(
    (meal: MealView) => (canSwapMeal(isPro) ? setSwapId(meal.id) : openGate('meal_swap')),
    [isPro],
  );
  const onOpenMeal = useCallback((meal: MealView) => {
    openMeal(meal);
  }, []);

  // The meals swap sheet (engine swapChoices + applySwap) works on the meals domain's view.
  const swapRow = swapId ? model.snapshot?.today.meals.find((m) => m.id === swapId) : undefined;
  const swapMeal = useMemo<EatMealView | null>(
    () => (swapRow ? toMealView(swapRow, catalog, []) : null),
    [swapRow, catalog],
  );

  const date = view?.date;
  const onAddWater = useCallback(() => {
    if (date) quickAddWater(date);
  }, [date]);
  const openWater = useCallback(() => {
    if (date) router.push({ pathname: '/meal/water', params: { date } } as never);
  }, [date]);

  const sessionId = view?.workout?.sessionId;
  const onStart = useCallback(() => {
    if (sessionId) router.push(ROUTES.workout(sessionId));
  }, [sessionId]);
  const openEat = useCallback(() => router.push(ROUTES.eat), []);

  const closeCard = useCallback(() => {
    setOpenCard(null);
    if (cardParam) router.setParams({ card: undefined });
  }, [cardParam]);

  const header = (
    <IconButton
      icon={Settings}
      accessibilityLabel="Settings"
      onPress={() => router.push(ROUTES.settings)}
      testID="open-settings"
    />
  );

  let body: ReactNode = <TodaySkeleton />;
  if (model.status === 'error') {
    body = (
      <EmptyState
        icon={CloudOff}
        title="Couldn’t load today"
        body="Your data is safe on this phone. Try again."
        actionLabel="Try again"
        onAction={model.reload}
        testID="today-error"
      />
    );
  } else if (view?.state === 'not_onboarded') {
    body = (
      <EmptyState
        icon={Dumbbell}
        title="Let’s build your plan"
        body="Answer a few questions and Repwise plans your workouts and meals for every day."
        actionLabel="Build my plan"
        onAction={() => router.push(ROUTES.onboarding)}
        testID="today-onboard"
      />
    );
  } else if (view?.state === 'no_plan') {
    body = (
      <EmptyState
        icon={Sun}
        title="Your plan is on its way"
        body="Today’s workout and meals show up here as soon as your week is planned."
        actionLabel="Open Train"
        onAction={() => router.push(ROUTES.train)}
        testID="today-no-plan"
      />
    );
  } else if (view?.state === 'ready') {
    const pending = view.workout && !view.workout.done ? view.workout : null;
    const [first, ...rest] = assistant.cards;
    const cards = first ? [first, ...(moreCards ? rest : [])] : [];
    body = (
      <>
        <Text variant="eyebrow" color="textSecondary" testID="today-date">
          {view.dateLabel}
        </Text>
        {pending ? (
          <WorkoutCard workout={pending} onStart={onStart} onOpen={onStart} index={0} />
        ) : view.workout?.done ? (
          <WorkoutCard workout={view.workout} onStart={onStart} onOpen={onStart} index={0} />
        ) : view.restDay ? (
          <RestDayCard index={0} />
        ) : null}
        <StatsGrid
          tiles={dashboard.tiles}
          weightValues={dashboard.weightValues}
          onOpenEat={openEat}
          onOpenProgress={openProgress}
          onLogWeight={openLogWeight}
          onEnableSteps={onEnableSteps}
          index={1}
        />
        <MealsCard
          meals={view.meals}
          nextId={view.next?.id}
          loading={model.catalogLoading}
          onOpen={onOpenMeal}
          onToggle={onToggle}
          onSwap={onSwap}
          index={2}
        />
        {cards.map((c, i) => (
          <AssistantCard
            key={c.id}
            card={c}
            index={3 + i}
            onOpen={setOpenCard}
            onAction={(card) => void assistant.apply(card)}
            onDismiss={assistant.dismiss}
          />
        ))}
        {rest.length > 0 && !moreCards ? (
          <Button
            label={`${rest.length} more ${rest.length === 1 ? 'suggestion' : 'suggestions'}`}
            variant="tertiary"
            onPress={() => setMoreCards(true)}
            testID="today-more-cards"
          />
        ) : null}
        {view.evening ? (
          <EveningCard
            headline={view.evening.headline}
            items={view.evening.items}
            tomorrow={view.evening.tomorrow}
            index={4}
          />
        ) : null}
        <WaterCard
          totalMl={view.waterMl}
          goalMl={getWaterGoal()}
          onAdd={onAddWater}
          onOpen={openWater}
          testID="today-water"
        />
      </>
    );
  }

  return (
    <Screen
      title={view?.greeting ?? 'Today'}
      edges={['top']}
      testID="screen-today"
      headerRight={header}
    >
      <View style={{ gap: t.spacing.md }}>{body}</View>
      <SwapSheet meal={swapMeal} onClose={() => setSwapId(null)} />
      <CardDetailSheet
        card={detailCard}
        onClose={closeCard}
        onApply={(card) => {
          closeCard();
          void assistant.apply(card);
        }}
        onSnooze={(card) => {
          closeCard();
          assistant.snooze(card);
        }}
        onDismiss={(card) => {
          closeCard();
          assistant.dismiss(card);
        }}
      />
    </Screen>
  );
}
