import { router, useLocalSearchParams } from 'expo-router';
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Droplet,
  Lock,
  ShoppingBasket,
  Sparkles,
  Utensils,
  UtensilsCrossed,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { formatWater } from '@/features/nutrition/logic/water';
import { getWaterGoal } from '@/features/nutrition/waterGoal';
import { usePro } from '@/features/billing/hooks/usePro';
import { haptics } from '@/services/haptics';
import { useTheme } from '@/theme';
import { Card, EmptyState, IconButton, ListRow, PressableScale, Screen, Segmented, Text, showToast } from '@/ui';

import { MacroRings } from '../components/MacroRings';
import { MealTile } from '../components/MealTile';
import { SkeletonList } from '../components/SkeletonBlock';
import { SwapSheet } from '../components/SwapSheet';
import { WeekStrip } from '../components/WeekStrip';
import { enterAt } from '../components/motion';
import { useEatDay, useEatWeek, type MealView } from '../hooks/useEat';
import { addDays, dayLabel, shortDate, startOfWeek, todayISO, weekDates } from '../logic/dates';
import { addWater, markMealEaten, setMealOpen, undoLog } from '../service';

const VIEWS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
] as const;
type View_ = (typeof VIEWS)[number]['value'];

/** S21 Meal plan (day/week): targets, the day's meals with 1-tap ticks, swaps, week overview. */
export function EatScreen() {
  const [view, setView] = useState<View_>('day');
  const today = todayISO();
  const [date, setDate] = useState(today);
  const t = useTheme();
  // Deep links: widget quick log `/eat?log=1`; meal notification `/eat?mealId=…[&swap=1]`.
  const params = useLocalSearchParams<{ log?: string; mealId?: string; swap?: string }>();
  const logKey = params.log === '1' ? 'log' : null;
  const handledLog = useRef<string | null>(null);
  useEffect(() => {
    if (!logKey || handledLog.current === logKey) return;
    handledLog.current = logKey;
    router.push({ pathname: '/meal/log', params: { date: today } });
  }, [logKey, today]);
  const swapMealId = params.swap === '1' && params.mealId ? params.mealId : null;

  const openDay = useCallback((d: string) => {
    setDate(d);
    setView('day');
  }, []);

  return (
    <Screen
      title="Eat"
      edges={['top']}
      testID="screen-eat"
      headerRight={
        <IconButton
          icon={ShoppingBasket}
          accessibilityLabel="Grocery list"
          onPress={() => router.push({ pathname: '/grocery', params: { week: startOfWeek(date) } })}
          testID="open-grocery"
        />
      }
    >
      <Segmented options={VIEWS} value={view} onChange={setView} accessibilityLabel="Meal plan view" testID="eat-view" />
      <View style={{ gap: t.spacing.md }}>
        {view === 'day' ? (
          <DayView date={date} today={today} onDate={setDate} swapMealId={swapMealId} />
        ) : (
          <WeekView anchor={date} today={today} onOpenDay={openDay} />
        )}
      </View>
    </Screen>
  );
}

function DayView({
  date,
  today,
  onDate,
  swapMealId,
}: {
  date: string;
  today: string;
  onDate: (d: string) => void;
  /** Open the swap sheet for this meal once it is on screen (notification "Swap" action). */
  swapMealId?: string | null;
}) {
  const t = useTheme();
  const day = useEatDay(date);
  const { isPro } = usePro();
  const [swap, setSwap] = useState<MealView | null>(null);
  const handledSwap = useRef<string | null>(null);
  const linked = swapMealId ? day.meals.find((m) => m.id === swapMealId) : undefined;
  useEffect(() => {
    if (!linked || handledSwap.current === linked.id) return;
    handledSwap.current = linked.id;
    setSwap(linked);
  }, [linked]);
  const dates = useMemo(() => weekDates(startOfWeek(date)), [date]);
  const locked = !isPro && date !== today;
  const waterGoal = getWaterGoal();

  const toggle = (m: MealView) => {
    if (m.status === 'eaten') {
      setMealOpen(m.id, 'planned');
      haptics.light();
      return;
    }
    markMealEaten(m.id);
    haptics.success();
    showToast({ message: `${m.title} logged`, tone: 'success', actionLabel: 'Undo', onAction: () => setMealOpen(m.id, 'planned') });
  };

  const quickWater = () => {
    const row = addWater(date, 250);
    haptics.light();
    showToast({ message: '250 ml water added', actionLabel: 'Undo', onAction: () => undoLog(row.id) });
  };

  const header = (
    <>
      <WeekStrip dates={dates} selected={date} today={today} onSelect={onDate} locked={(d) => !isPro && d !== today} />
      <Text variant="caption" color="textSecondary" testID="eat-day-label">
        {dayLabel(date, today)}
        {day.plan?.dayType ? ` · ${day.plan.dayType === 'training' ? 'Training day' : 'Rest day'}` : ''}
      </Text>
    </>
  );

  if (day.state === 'loading') {
    return (
      <>
        {header}
        <SkeletonList testID="eat-loading" />
      </>
    );
  }
  if (day.state === 'no_profile') {
    return (
      <EmptyState
        icon={Utensils}
        title="Your meal plan starts with you"
        body="Answer a few questions about your goal and food, and we'll plan every meal."
        actionLabel="Set up my plan"
        onAction={() => router.push('/welcome' as never)}
        testID="eat-no-profile"
      />
    );
  }
  if (day.state === 'error') {
    return (
      <>
        {header}
        <EmptyState
          icon={CircleAlert}
          title="Couldn't build your plan"
          body="Something went wrong on this phone. Your logged meals are safe."
          actionLabel="Try again"
          onAction={day.retry}
          testID="eat-error"
        />
      </>
    );
  }

  const target = day.targets;
  return (
    <>
      {header}
      {target ? (
        <Card
          onPress={() => router.push({ pathname: '/meal/day/[date]', params: { date } })}
          accessibilityLabel="Open the day's nutrition log"
          testID="eat-rings"
        >
          <MacroRings
            eaten={{ kcal: day.intake.kcal, protein: day.intake.p, carbs: day.intake.c, fat: day.intake.f }}
            target={target}
          />
        </Card>
      ) : null}
      <ListRow
        title="Daily targets"
        value={target ? `${target.kcal.toLocaleString('en-US')} kcal` : undefined}
        icon={Sparkles}
        onPress={() => router.push({ pathname: '/meal/targets', params: { date } })}
        chevron
        testID="open-targets"
      />

      {locked ? (
        <EmptyState
          icon={Lock}
          title="Plan ahead with Pro"
          body="Today's meals are free. Pro shows the whole week, swaps and the grocery list."
          actionLabel="See Pro"
          onAction={() => router.push({ pathname: '/paywall', params: { source: 'eat_week' } })}
          testID="eat-locked"
        />
      ) : day.meals.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          title={date < today ? 'Nothing planned that day' : 'No meals fit every filter'}
          body={
            date < today
              ? 'You can still log what you ate.'
              : 'Your allergies, diet and dislikes leave too few recipes for this day. Log food as you go.'
          }
          actionLabel="Log food"
          onAction={() => router.push({ pathname: '/meal/log', params: { date } })}
          testID="eat-empty"
        />
      ) : (
        <View style={{ gap: t.spacing.sm }} testID="eat-meals">
          {day.meals.map((m, i) => (
            <MealTile
              key={m.id}
              meal={m}
              index={i}
              onOpen={() =>
                m.recipeId &&
                router.push({ pathname: '/recipe/[id]', params: { id: m.recipeId, portion: String(m.portion), mealId: m.id } })
              }
              onToggle={() => toggle(m)}
              onSwap={() => setSwap(m)}
            />
          ))}
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
        <PressableScale
          testID="open-log"
          onPress={() => router.push({ pathname: '/meal/log', params: { date } })}
          accessibilityRole="button"
          accessibilityLabel="Ate out or log food"
          style={{ flex: 1, minHeight: t.sizes.button + t.spacing.lg, backgroundColor: t.colors.surface, borderRadius: t.radius.card, padding: t.spacing.card, gap: t.spacing.xxs }}
        >
          <UtensilsCrossed color={t.colors.textPrimary} size={t.sizes.icon} strokeWidth={t.sizes.iconStroke} />
          <Text variant="headline">Ate out</Text>
          <Text variant="caption" color="textSecondary">
            Log food or a meal out
          </Text>
        </PressableScale>
        <PressableScale
          testID="open-water"
          onPress={() => router.push({ pathname: '/meal/water', params: { date } })}
          onLongPress={quickWater}
          accessibilityRole="button"
          accessibilityLabel={`Water: ${formatWater(day.waterMl)} of ${formatWater(waterGoal)}`}
          accessibilityHint="Long-press to add a glass"
          style={{ flex: 1, minHeight: t.sizes.button + t.spacing.lg, backgroundColor: t.colors.surface, borderRadius: t.radius.card, padding: t.spacing.card, gap: t.spacing.xxs }}
        >
          <Droplet color={t.colors.macroProtein} size={t.sizes.icon} strokeWidth={t.sizes.iconStroke} />
          <Text variant="headline" tabular>
            {formatWater(day.waterMl)}
          </Text>
          <Text variant="caption" color="textSecondary">
            of {formatWater(waterGoal)} water
          </Text>
        </PressableScale>
      </View>

      <SwapSheet meal={swap} onClose={() => setSwap(null)} />
    </>
  );
}

function WeekView({ anchor, today, onOpenDay }: { anchor: string; today: string; onOpenDay: (d: string) => void }) {
  const t = useTheme();
  const reduce = useReducedMotion();
  const [start, setStart] = useState(startOfWeek(anchor));
  const week = useEatWeek(start);
  const { isPro } = usePro();
  const thisWeek = startOfWeek(today);
  const end = addDays(start, 6);
  const label = start === thisWeek ? 'This week' : start === addDays(thisWeek, 7) ? 'Next week' : `Week of ${shortDate(start)}`;

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <IconButton
          icon={ChevronLeft}
          accessibilityLabel="Previous week"
          onPress={() => setStart(addDays(start, -7))}
          disabled={start <= addDays(thisWeek, -28)}
          testID="week-prev"
          feedback="selection"
        />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text variant="headline" testID="week-label">
            {label}
          </Text>
          <Text variant="caption" color="textSecondary">
            {shortDate(start)} – {shortDate(end)}
          </Text>
        </View>
        <IconButton
          icon={ChevronRight}
          accessibilityLabel="Next week"
          onPress={() => setStart(addDays(start, 7))}
          disabled={start >= addDays(thisWeek, 7)}
          testID="week-next"
          feedback="selection"
        />
      </View>

      <Card
        onPress={() => router.push({ pathname: '/grocery', params: { week: start } })}
        accessibilityLabel="Grocery list for this week"
        testID="week-grocery"
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
          <ShoppingBasket color={t.colors.textPrimary} size={t.sizes.icon} strokeWidth={t.sizes.iconStroke} />
          <View style={{ flex: 1 }}>
            <Text variant="headline">Grocery list</Text>
            <Text variant="caption" color="textSecondary">
              The whole week in one list, by aisle
            </Text>
          </View>
          <ChevronRight color={t.colors.textTertiary} size={t.sizes.icon} strokeWidth={t.sizes.iconStroke} />
        </View>
      </Card>

      {week.state === 'loading' ? (
        <SkeletonList rows={5} testID="week-loading" />
      ) : week.state === 'no_profile' ? (
        <EmptyState
          icon={Utensils}
          title="No plan yet"
          body="Finish setting up and your week of meals appears here."
          testID="week-no-profile"
        />
      ) : (
        <View style={{ gap: t.spacing.sm }} testID="week-days">
          {week.days.map((d, i) => {
            const lockedDay = !isPro && d.date !== today;
            return (
              <Animated.View key={d.date} entering={enterAt(i, reduce)}>
                <Card
                  onPress={() => onOpenDay(d.date)}
                  accessibilityLabel={`${dayLabel(d.date, today)}: ${d.meals.length} meals${lockedDay ? ', Pro' : ''}`}
                  testID={`week-day-${d.date}`}
                  selected={d.date === today}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: t.spacing.xs }}>
                    <Text variant="headline" style={{ flex: 1 }}>
                      {dayLabel(d.date, today)}
                    </Text>
                    {lockedDay ? (
                      <Lock color={t.colors.textSecondary} size={t.sizes.iconSmall} strokeWidth={t.sizes.iconStroke} />
                    ) : (
                      <Text variant="caption" color="textSecondary" tabular>
                        {d.meals.length
                          ? `${d.kcal.toLocaleString('en-US')}${d.target ? ` / ${d.target.toLocaleString('en-US')}` : ''} kcal`
                          : d.date < today
                            ? 'Past'
                            : 'Not planned'}
                      </Text>
                    )}
                  </View>
                  {lockedDay ? (
                    <Text variant="callout" color="textSecondary">
                      {d.meals.length} meals planned
                    </Text>
                  ) : (
                    d.meals.map((m) => (
                      <Text key={m.id} variant="callout" color={m.status === 'eaten' ? 'textSecondary' : 'textPrimary'} numberOfLines={1}>
                        {m.status === 'eaten' ? '✓ ' : ''}
                        {m.title}
                      </Text>
                    ))
                  )}
                </Card>
              </Animated.View>
            );
          })}
        </View>
      )}
    </>
  );
}
