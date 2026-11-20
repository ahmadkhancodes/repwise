import { router, useLocalSearchParams } from 'expo-router';
import { Check, ChevronLeft, ChevronRight, CircleAlert, Lock, ShoppingBasket, Utensils, UtensilsCrossed } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { WaterCard } from '@/features/nutrition/components/WaterCard';
import { getWaterGoal } from '@/features/nutrition/waterGoal';
import { usePro } from '@/features/billing/hooks/usePro';
import { useTheme } from '@/theme';
import {
  Badge,
  Card,
  EmptyState,
  IconButton,
  ListRow,
  MacroRings,
  Screen,
  Segmented,
  Skeleton,
  SkeletonCard,
  SkeletonGroup,
  Text,
  WeekStrip,
  type WeekDay,
} from '@/ui';
import { enterAt } from '@/ui/listMotion';

import { quickAddWater, tickMealFromLink, toggleMeal } from '../actions';
import { TargetsIcon } from '../components/icons';
import { MealTile } from '../components/MealTile';
import { SwapSheet } from '../components/SwapSheet';
import { useEatDay, useEatWeek, type MealView } from '../hooks/useEat';
import { addDays, dayLabel, dayOfMonth, shortDate, shortWeekday, startOfWeek, todayISO, weekDates } from '../logic/dates';

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
  // Deep links: widget quick log `/eat?log=1`; meal notification `/eat?mealId=…[&swap=1]`;
  // widget "Ate it" `/eat?mealId=…&tick=1`.
  const params = useLocalSearchParams<{ log?: string; mealId?: string; swap?: string; tick?: string }>();
  const tickMealId = params.tick === '1' && params.mealId ? params.mealId : null;
  const handledTick = useRef<string | null>(null);
  useEffect(() => {
    if (!tickMealId || handledTick.current === tickMealId) return;
    handledTick.current = tickMealId;
    tickMealFromLink(tickMealId); // the widget's next meal is today's: the Day view already shows it
    router.setParams({ tick: undefined, mealId: undefined });
  }, [tickMealId]);
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

/** Seven days for the shared WeekStrip (Pro-locked days say so). Pure. */
export function eatWeekDays(dates: readonly string[], today: string, locked: (d: string) => boolean): WeekDay[] {
  return dates.map((d) => ({
    key: d,
    weekday: shortWeekday(d),
    day: dayOfMonth(d),
    locked: locked(d),
    accessibilityLabel: `${dayLabel(d, today)}${locked(d) ? ', Pro' : ''}`,
  }));
}

function EatSkeleton({ testID }: { testID: string }) {
  const t = useTheme();
  return (
    <SkeletonGroup label="Loading meals" testID={testID} style={{ gap: t.spacing.sm }}>
      <Skeleton height={t.sizes.ring + t.spacing.xl + t.spacing.card * 2} radius={t.radius.card} />
      <SkeletonCard media lines={2} />
      <SkeletonCard media lines={2} />
      <SkeletonCard media lines={2} />
    </SkeletonGroup>
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
  const weekDays = useMemo(
    () => eatWeekDays(weekDates(startOfWeek(date)), today, (d) => !isPro && d !== today),
    [date, today, isPro],
  );
  const locked = !isPro && date !== today;
  const waterGoal = getWaterGoal();

  // Stable handlers (MealTile is memoised); the toggle changes only when the day's meals do.
  const dayMeals = day.meals;
  const onToggle = useCallback((m: MealView) => {
    toggleMeal(m, dayMeals);
  }, [dayMeals]);
  const onSwap = useCallback((m: MealView) => setSwap(m), []);
  const onOpen = useCallback((m: MealView) => {
    if (!m.recipeId) return;
    router.push({ pathname: '/recipe/[id]', params: { id: m.recipeId, portion: String(m.portion), mealId: m.id } });
  }, []);

  const header = (
    <>
      <WeekStrip days={weekDays} selectedKey={date} todayKey={today} onSelect={onDate} testID="week-strip" />
      <Text variant="callout" color="textSecondary" testID="eat-day-label">
        {dayLabel(date, today)}
        {day.plan?.dayType ? ` · ${day.plan.dayType === 'training' ? 'Training day' : 'Rest day'}` : ''}
      </Text>
    </>
  );

  if (day.state === 'loading') {
    return (
      <>
        {header}
        <EatSkeleton testID="eat-loading" />
      </>
    );
  }
  if (day.state === 'no_profile') {
    return (
      <EmptyState
        icon={Utensils}
        title="Your meal plan starts with you"
        body="Answer a few questions about your goal and food, and we’ll plan every meal."
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
          title="Couldn’t build your plan"
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
          accessibilityLabel="Open the day’s nutrition log"
          testID="eat-rings"
        >
          <MacroRings
            eaten={{ kcal: day.intake.kcal, protein: day.intake.p, carbs: day.intake.c, fat: day.intake.f }}
            target={target}
            testID="eat-macros"
          />
        </Card>
      ) : null}
      <ListRow
        title="Daily targets"
        value={target ? `${target.kcal.toLocaleString()} kcal` : undefined}
        icon={TargetsIcon}
        onPress={() => router.push({ pathname: '/meal/targets', params: { date } })}
        chevron
        testID="open-targets"
      />

      {locked ? (
        <EmptyState
          icon={Lock}
          title="Plan ahead with Pro"
          body="Today’s meals are free. Pro shows the whole week, swaps and the grocery list."
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
            <MealTile key={m.id} meal={m} index={i} onOpen={onOpen} onToggle={onToggle} onSwap={onSwap} />
          ))}
        </View>
      )}

      <ListRow
        title="Ate out or off-plan?"
        subtitle="Log food or a meal out"
        icon={UtensilsCrossed}
        onPress={() => router.push({ pathname: '/meal/log', params: { date } })}
        chevron
        testID="open-log"
      />
      <WaterCard
        totalMl={day.waterMl}
        goalMl={waterGoal}
        onAdd={() => quickAddWater(date)}
        onOpen={() => router.push({ pathname: '/meal/water', params: { date } })}
        testID="eat-water"
      />

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
  const icon = { size: t.sizes.iconSmall, strokeWidth: t.sizes.iconStrokeBold };

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

      <ListRow
        title="Grocery list"
        subtitle="The whole week in one list, by aisle"
        icon={ShoppingBasket}
        onPress={() => router.push({ pathname: '/grocery', params: { week: start } })}
        chevron
        testID="week-grocery"
      />

      {week.state === 'loading' ? (
        <SkeletonGroup label="Loading the week" testID="week-loading" style={{ gap: t.spacing.sm }}>
          {Array.from({ length: 5 }, (_, i) => (
            <SkeletonCard key={i} lines={3} />
          ))}
        </SkeletonGroup>
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
            const isToday = d.date === today;
            return (
              <Animated.View key={d.date} entering={enterAt(i, reduce)}>
                <Card
                  onPress={() => onOpenDay(d.date)}
                  accessibilityLabel={`${dayLabel(d.date, today)}: ${d.meals.length} meals, ${d.eaten} eaten${lockedDay ? ', Pro' : ''}`}
                  testID={`week-day-${d.date}`}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}>
                    <Text variant="headline" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {dayLabel(d.date, today)}
                    </Text>
                    {isToday ? <Badge label="Today" tone="accent" testID="week-today-badge" /> : null}
                    <View style={{ flex: 1 }} />
                    {lockedDay ? (
                      <Lock color={t.colors.textSecondary} size={t.sizes.iconSmall} strokeWidth={t.sizes.iconStroke} />
                    ) : (
                      <Text variant="caption" color="textSecondary" tabular>
                        {d.meals.length
                          ? `${d.kcal.toLocaleString()}${d.target ? ` / ${d.target.toLocaleString()}` : ''} kcal`
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
                    <View style={{ gap: t.spacing.xxs, marginTop: t.spacing.xxs }}>
                      {d.meals.map((m) => {
                        const ate = m.status === 'eaten';
                        return (
                          <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}>
                            {ate ? (
                              <Check color={t.colors.accentText} {...icon} testID={`week-eaten-${m.id}`} />
                            ) : (
                              <View style={{ width: t.sizes.iconSmall }} />
                            )}
                            <Text
                              variant="callout"
                              color={ate ? 'textSecondary' : 'textPrimary'}
                              numberOfLines={1}
                              style={{ flex: 1 }}
                            >
                              {m.title}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
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
