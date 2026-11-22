import { router, useLocalSearchParams } from 'expo-router';
import { Clock, Search, UtensilsCrossed } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { enterAt } from '@/ui/listMotion';
import { useEatDay } from '@/features/meals/hooks/useEat';
import { isISODate, todayISO } from '@/features/meals/logic/dates';
import { nextSlotIndex, slotLabel } from '@/features/meals/logic/slots';
import { logOffPlan } from '@/features/meals/service';
import { searchFoods, type Food } from '@/services/catalog';
import { useTheme } from '@/theme';
import { canLogAteOut, openGate, usePro } from '@/features/billing';
import {
  BackButton,
  BigNumber,
  Button,
  Checkbox,
  Chip,
  EmptyState,
  ListRow,
  Screen,
  SearchBar,
  Segmented,
  Sheet,
  showToast,
  SkeletonCard,
  SkeletonGroup,
  Text,
  WheelPicker,
} from '@/ui';

import {
  QUICK_ESTIMATES,
  defaultGrams,
  gramOptions,
  macrosForGrams,
  nearestGram,
  recentNames,
  type QuickEstimate,
} from '../logic/food';
import { useRecentSearchLogs } from '../repo';

const MODES = [
  { value: 'out', label: 'Ate out' },
  { value: 'food', label: 'Search food' },
] as const;
const SLOTS = ['breakfast', 'lunch', 'snack', 'dinner'] as const;
const GRAMS = gramOptions().map((g) => ({ value: g, label: `${g} g` }));

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** S23 "Ate out" / quick log: estimate a meal out or search the food catalogue; the day rebalances. */
export function FoodLogScreen() {
  const t = useTheme();
  const reduce = useReducedMotion();
  const params = useLocalSearchParams<{ date?: string; mode?: string }>();
  const date = isISODate(params.date) ? params.date : todayISO();
  const day = useEatDay(date);
  // 'Ate out' + rebalance is Pro (sheet 05); free users log food and meet the gate on 'Ate out'.
  const ateOutOk = canLogAteOut(usePro().isPro);
  const [mode, setMode] = useState<'out' | 'food'>(
    params.mode === 'food' || !ateOutOk ? 'food' : 'out',
  );
  const onMode = (m: 'out' | 'food') =>
    m === 'out' && !ateOutOk ? openGate('ate_out') : setMode(m);
  const next = nextSlotIndex(day.meals, nowHHMM(), day.profile?.mealTimes ?? []);
  const [slotPick, setSlotPick] = useState<string | null>(null);
  const slot = slotPick ?? day.meals[next]?.slot ?? 'lunch';
  const planned = day.meals.find((m) => m.slot === slot && m.status === 'planned');
  const [replace, setReplace] = useState<boolean | null>(null);
  const replacing = (replace ?? mode === 'out') && Boolean(planned);
  const [estimate, setEstimate] = useState<QuickEstimate>(QUICK_ESTIMATES[2]);
  const [query, setQuery] = useState('');
  const [food, setFood] = useState<Food | null>(null);
  const [grams, setGrams] = useState(100);
  const recentLogs = useRecentSearchLogs();
  const cat = day.catalog;

  const results = useMemo(
    () => (cat && query.trim() ? searchFoods(query, { limit: 30 }) : []),
    [cat, query],
  );
  const recent = useMemo(() => {
    if (!cat) return [];
    const byName = new Map(cat.foods.map((f) => [f.name, f]));
    return recentNames(recentLogs).flatMap((n) => (byName.has(n) ? [byName.get(n)!] : []));
  }, [cat, recentLogs]);

  // Core action: the success toast owns the one success buzz.
  const done = (rebalanced: number, what: string) => {
    showToast({
      message:
        rebalanced > 0
          ? `${what} logged. ${rebalanced} meal${rebalanced === 1 ? '' : 's'} adjusted.`
          : `${what} logged`,
      tone: 'success',
    });
    if (router.canGoBack()) router.back();
  };

  const logOut = () => {
    const res = logOffPlan({
      date,
      slot,
      name: `${estimate.label} out`,
      kcal: estimate.kcal,
      p: estimate.p,
      c: estimate.c,
      f: estimate.f,
      source: 'quick',
      replaceMealId: replacing ? planned?.id : null,
    });
    done(res.rebalanced, 'Meal out');
  };

  const openFood = (f: Food) => {
    const last = recentLogs.find((l) => l.name === f.name);
    // Re-use the last portion of a recent food (stored kcal ÷ per-100 g), else a typical default.
    const g =
      last && f.per100g.kcal > 0
        ? nearestGram((last.kcal / f.per100g.kcal) * 100)
        : defaultGrams(f.category);
    setGrams(nearestGram(g));
    setFood(f);
  };

  const logFoodItem = () => {
    if (!food) return;
    const m = macrosForGrams(food, grams);
    const res = logOffPlan({
      date,
      slot,
      name: food.name,
      ...m,
      source: 'search',
      replaceMealId: replacing ? planned?.id : null,
    });
    setFood(null);
    done(res.rebalanced, food.name);
  };

  const slotChips = (
    <View style={{ gap: t.spacing.xs }}>
      <Text variant="caption" color="textSecondary">
        Meal
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs }}>
        {SLOTS.map((s) => (
          <Chip
            key={s}
            role="radio"
            label={slotLabel(s)}
            selected={slot === s}
            onPress={() => setSlotPick(s)}
            testID={`log-slot-${s}`}
          />
        ))}
      </View>
      {planned ? (
        <Chip
          label={`Instead of ${planned.title}`}
          selected={replacing}
          onPress={() => setReplace(!replacing)}
          testID="log-replace"
        />
      ) : null}
    </View>
  );

  return (
    <>
      <Screen
        keyboard
        title="Log food"
        headerLeft={<BackButton fallback="/eat" />}
        testID="screen-log"
        footer={
          mode === 'out' ? (
            <Button
              label={`Log ${estimate.label.toLowerCase()} out`}
              onPress={logOut}
              testID="log-out-save"
            />
          ) : undefined
        }
      >
        <Segmented
          options={MODES}
          value={mode}
          onChange={onMode}
          accessibilityLabel="Log type"
          testID="log-mode"
        />
        {!cat ? (
          <SkeletonGroup testID="log-loading" style={{ gap: t.spacing.sm }}>
            {Array.from({ length: 3 }, (_, i) => (
              <SkeletonCard key={i} lines={2} />
            ))}
          </SkeletonGroup>
        ) : mode === 'out' ? (
          <>
            {slotChips}
            <Text variant="caption" color="textSecondary">
              How big was it? A rough guess is fine.
            </Text>
            <View
              accessibilityRole="radiogroup"
              style={{
                backgroundColor: t.colors.surface,
                borderRadius: t.radius.card,
                paddingHorizontal: t.spacing.card,
              }}
            >
              {QUICK_ESTIMATES.map((e, i) => (
                <Animated.View key={e.id} entering={enterAt(i, reduce)}>
                  <Checkbox
                    role="radio"
                    checked={estimate.id === e.id}
                    onChange={() => setEstimate(e)}
                    label={e.label}
                    description={e.hint}
                    testID={`estimate-${e.id}`}
                  />
                </Animated.View>
              ))}
            </View>
            <Text variant="caption" color="textSecondary">
              Your remaining planned meals are re-portioned so the day still adds up.
            </Text>
          </>
        ) : (
          <>
            {slotChips}
            <SearchBar
              value={query}
              onChangeText={setQuery}
              placeholder="Chicken, rice, banana…"
              accessibilityLabel="Search food"
              testID="food-search"
            />
            {query.trim() ? (
              results.length ? (
                <View testID="food-results">
                  {results.map((f) => (
                    <ListRow
                      key={f.id}
                      title={f.name}
                      subtitle={`${f.per100g.kcal} kcal per 100 g`}
                      onPress={() => openFood(f)}
                      chevron
                      testID={`food-${f.id}`}
                    />
                  ))}
                </View>
              ) : (
                <EmptyState
                  icon={Search}
                  title="No matches"
                  body="Try a simpler word, like 'rice' or 'yogurt'."
                  testID="food-none"
                />
              )
            ) : recent.length ? (
              <View testID="food-recent">
                <Text variant="caption" color="textSecondary">
                  Recent
                </Text>
                {recent.map((f) => (
                  <ListRow
                    key={f.id}
                    title={f.name}
                    icon={Clock}
                    onPress={() => openFood(f)}
                    chevron
                    testID={`recent-${f.id}`}
                  />
                ))}
              </View>
            ) : (
              <EmptyState
                icon={UtensilsCrossed}
                title={`Search ${cat.foods.length} everyday foods`}
                body="Nutrition from USDA FoodData Central."
                testID="food-hint"
              />
            )}
          </>
        )}

        <Sheet
          open={food !== null}
          onClose={() => setFood(null)}
          title={food?.name}
          testID="portion-sheet"
        >
          {food ? (
            <>
              <BigNumber
                value={macrosForGrams(food, grams).kcal}
                unit="kcal"
                testID="portion-kcal"
              />
              <Text variant="caption" color="textSecondary" tabular>
                P {macrosForGrams(food, grams).p} g · C {macrosForGrams(food, grams).c} g · F{' '}
                {macrosForGrams(food, grams).f} g
              </Text>
              <WheelPicker
                items={GRAMS}
                value={grams}
                onChange={setGrams}
                accessibilityLabel="Portion in grams"
                testID="portion-wheel"
              />
              <Button
                label={`Add to ${slotLabel(slot).toLowerCase()}`}
                onPress={logFoodItem}
                testID="portion-add"
              />
            </>
          ) : null}
        </Sheet>
      </Screen>
    </>
  );
}
