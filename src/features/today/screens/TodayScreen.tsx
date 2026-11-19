import { router, useLocalSearchParams, type Href } from 'expo-router';
import { CloudOff, Settings, Sparkles, Sun } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { AssistantCard } from '@/features/assistant/components/AssistantCard';
import { CardDetailSheet } from '@/features/assistant/components/CardDetailSheet';
import { useAssistant } from '@/features/assistant/hooks/useAssistant';
import type { ShownCard } from '@/features/assistant/logic/cardState';
import { usePro } from '@/features/billing';
import { track } from '@/services/analytics';
import { useCatalog } from '@/services/catalog';
import { haptics } from '@/services/haptics';
import { useTheme } from '@/theme';
import { EmptyState, IconButton, Screen, showToast, Text } from '@/ui';

import { EveningCard } from '../components/EveningCard';
import { MealsCard } from '../components/MealsCard';
import { MorningBrief } from '../components/MorningBrief';
import { RingsCard } from '../components/RingsCard';
import { TodaySkeleton } from '../components/Skeleton';
import { SwapSheet } from '../components/SwapSheet';
import { WaterCard } from '../components/WaterCard';
import { RestDayCard, WorkoutCard } from '../components/WorkoutCard';
import { recipeLookup, useToday } from '../hooks/useToday';
import { localHour } from '../logic/day';
import type { MealView } from '../logic/meals';
import { GLASS_ML } from '../logic/water';
import type { SwapOption } from '../plannerBridge';
import { addWater, applySwap, tickMeal, untickMeal } from '../repo';

/** Undo window for the core action (P5 acceptance: undo toast, 5 s). */
export const UNDO_MS = 5000;

export const ROUTES = {
  onboarding: '/(onboarding)/welcome' as Href,
  train: '/train' as Href,
  settings: '/settings' as Href,
  checkin: '/checkin' as Href,
  workout: (sessionId: string) => `/workout/${sessionId}` as Href,
};

/** S11 Today (home): brief, assistant cards, rings, workout, meals, water, evening. */
export function TodayScreen({ now: nowOverride }: { now?: number } = {}) {
  const t = useTheme();
  const model = useToday(nowOverride);
  const { isPro } = usePro(nowOverride);
  const catalog = useCatalog();
  const recipe = useMemo(() => recipeLookup(catalog), [catalog]);
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

  const [swapMeal, setSwapMeal] = useState<MealView | null>(null);
  const [openCard, setOpenCard] = useState<ShownCard | null>(null);

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

  const onToggle = useCallback(
    (meal: MealView) => {
      if (!view) return;
      if (meal.status === 'eaten') {
        untickMeal(meal, view.date, meal.title);
        haptics.light();
        return;
      }
      const undo = tickMeal(meal, view.date, meal.title, meal.nutrients);
      track('meal_logged', { slot: meal.slot, from_plan: true });
      showToast({
        message: `${meal.slotLabel} logged`,
        tone: 'success',
        actionLabel: 'Undo',
        onAction: undo,
        durationMs: UNDO_MS,
      });
    },
    [view],
  );

  const onPickSwap = useCallback((meal: MealView, option: SwapOption) => {
    applySwap(meal.id, option.recipeId);
    track('meal_swapped', { slot: meal.slot });
    haptics.light();
    setSwapMeal(null);
    showToast({ message: `${meal.slotLabel} swapped` });
  }, []);

  const onAddWater = useCallback(() => {
    if (!view) return;
    const undo = addWater(view.date);
    showToast({
      message: `${GLASS_ML} ml water added`,
      tone: 'success',
      actionLabel: 'Undo',
      onAction: undo,
      durationMs: UNDO_MS,
    });
  }, [view]);

  const onStart = useCallback(() => {
    if (view?.workout) router.push(ROUTES.workout(view.workout.sessionId));
  }, [view]);

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
        icon={Sparkles}
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
    let i = 0;
    body = (
      <>
        {view.evening ? (
          <EveningCard
            headline={view.evening.headline}
            items={view.evening.items}
            tomorrow={view.evening.tomorrow}
            index={i++}
          />
        ) : (
          <MorningBrief rows={view.brief} index={i++} />
        )}
        {assistant.cards.map((c) => (
          <AssistantCard
            key={c.id}
            card={c}
            index={i++}
            onOpen={setOpenCard}
            onAction={(card) => void assistant.apply(card)}
            onDismiss={assistant.dismiss}
          />
        ))}
        {view.targets ? <RingsCard eaten={view.eaten} targets={view.targets} index={i++} /> : null}
        {view.workout ? (
          <WorkoutCard workout={view.workout} onStart={onStart} onOpen={onStart} index={i++} />
        ) : view.restDay ? (
          <RestDayCard index={i++} />
        ) : null}
        <MealsCard
          meals={view.meals}
          loading={model.catalogLoading}
          onToggle={onToggle}
          onSwap={setSwapMeal}
          index={i++}
        />
        <WaterCard totalMl={view.waterMl} onAdd={onAddWater} index={i++} />
      </>
    );
  }

  return (
    <Screen title={view?.greeting ?? 'Today'} edges={['top']} testID="screen-today" headerRight={header}>
      {view ? (
        <Text variant="callout" color="textSecondary" style={{ marginTop: -t.spacing.sm }} testID="today-date">
          {view.dateLabel}
        </Text>
      ) : null}
      <View style={{ gap: t.spacing.md }}>{body}</View>
      <SwapSheet meal={swapMeal} recipe={recipe} onClose={() => setSwapMeal(null)} onPick={onPickSwap} />
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
