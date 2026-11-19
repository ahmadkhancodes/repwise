import { router, useLocalSearchParams, type Href } from 'expo-router';
import { CloudOff, Settings, Sparkles, Sun } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { AssistantCard } from '@/features/assistant/components/AssistantCard';
import { CardDetailSheet } from '@/features/assistant/components/CardDetailSheet';
import { useAssistant } from '@/features/assistant/hooks/useAssistant';
import type { ShownCard } from '@/features/assistant/logic/cardState';
import { usePro } from '@/features/billing';
import {
  addWater,
  markMealEaten,
  setMealOpen,
  SwapSheet,
  toMealView,
  undoLog,
  type MealView as EatMealView,
} from '@/features/meals';
import { getWaterGoal } from '@/features/nutrition';
import { GLASS_ML } from '@/features/nutrition/logic/water';
import { useCatalog } from '@/services/catalog';
import { haptics } from '@/services/haptics';
import { useTheme } from '@/theme';
import { EmptyState, IconButton, Screen, showToast, Text } from '@/ui';

import { EveningCard } from '../components/EveningCard';
import { MealsCard } from '../components/MealsCard';
import { MorningBrief } from '../components/MorningBrief';
import { RingsCard } from '../components/RingsCard';
import { TodaySkeleton } from '../components/Skeleton';
import { WaterCard } from '../components/WaterCard';
import { RestDayCard, WorkoutCard } from '../components/WorkoutCard';
import { useToday } from '../hooks/useToday';
import { localHour } from '../logic/day';
import type { MealView } from '../logic/meals';

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

  const [swapId, setSwapId] = useState<string | null>(null);
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

  // Meal writes go through the meals domain, so a tick always writes the intake log (and its
  // analytics event) exactly as on Eat. Undo restores the planned state and removes that log.
  const onToggle = useCallback((meal: MealView) => {
    if (meal.status === 'eaten') {
      setMealOpen(meal.id, 'planned');
      haptics.light();
      return;
    }
    if (!markMealEaten(meal.id)) return;
    showToast({
      message: `${meal.slotLabel} logged`,
      tone: 'success',
      actionLabel: 'Undo',
      onAction: () => {
        setMealOpen(meal.id, 'planned');
      },
      durationMs: UNDO_MS,
    });
  }, []);

  // The meals swap sheet (engine swapChoices + applySwap) works on the meals domain's view.
  const swapMeal = useMemo<EatMealView | null>(() => {
    const row = swapId ? model.snapshot?.today.meals.find((m) => m.id === swapId) : undefined;
    return row ? toMealView(row, catalog, []) : null;
  }, [swapId, model.snapshot, catalog]);

  const onAddWater = useCallback(() => {
    if (!view) return;
    const row = addWater(view.date, GLASS_ML);
    showToast({
      message: `${GLASS_ML} ml water added`,
      tone: 'success',
      actionLabel: 'Undo',
      onAction: () => {
        undoLog(row.id);
      },
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
          onSwap={(m) => setSwapId(m.id)}
          index={i++}
        />
        <WaterCard totalMl={view.waterMl} goalMl={getWaterGoal()} onAdd={onAddWater} index={i++} />
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
