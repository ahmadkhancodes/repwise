import { router, useLocalSearchParams } from 'expo-router';
import { Clock, Search, UtensilsCrossed } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { BackButton } from '@/features/meals/components/BackButton';
import { enterAt } from '@/features/meals/components/motion';
import { SkeletonList } from '@/features/meals/components/SkeletonBlock';
import { useEatDay } from '@/features/meals/hooks/useEat';
import { isISODate, todayISO } from '@/features/meals/logic/dates';
import { nextSlotIndex, slotLabel } from '@/features/meals/logic/slots';
import { logOffPlan } from '@/features/meals/service';
import { haptics } from '@/services/haptics';
import { searchFoods, type Food } from '@/services/catalog';
import { useTheme } from '@/theme';
import {
  BigNumber,
  Button,
  Chip,
  EmptyState,
  ListRow,
  PressableScale,
  Screen,
  Segmented,
  Sheet,
  Text,
  TextField,
  WheelPicker,
  showToast,
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
  const [mode, setMode] = useState<'out' | 'food'>(params.mode === 'food' ? 'food' : 'out');
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

  const results = useMemo(() => (cat && query.trim() ? searchFoods(query, { limit: 30 }) : []), [cat, query]);
  const recent = useMemo(() => {
    if (!cat) return [];
    const byName = new Map(cat.foods.map((f) => [f.name, f]));
    return recentNames(recentLogs).flatMap((n) => (byName.has(n) ? [byName.get(n)!] : []));
  }, [cat, recentLogs]);

  const done = (rebalanced: number, what: string) => {
    haptics.success();
    showToast({
      message: rebalanced > 0 ? `${what} logged. ${rebalanced} meal${rebalanced === 1 ? '' : 's'} adjusted.` : `${what} logged`,
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
    haptics.light();
    const last = recentLogs.find((l) => l.name === f.name);
    // Re-use the last portion of a recent food (stored kcal ÷ per-100 g), else a typical default.
    const g = last && f.per100g.kcal > 0 ? nearestGram((last.kcal / f.per100g.kcal) * 100) : defaultGrams(f.category);
    setGrams(nearestGram(g));
    setFood(f);
  };

  const logFoodItem = () => {
    if (!food) return;
    const m = macrosForGrams(food, grams);
    const res = logOffPlan({ date, slot, name: food.name, ...m, source: 'search', replaceMealId: replacing ? planned?.id : null });
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
          <Chip key={s} label={slotLabel(s)} selected={slot === s} onPress={() => setSlotPick(s)} testID={`log-slot-${s}`} />
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
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen
        title="Log food"
        headerLeft={<BackButton />}
        testID="screen-log"
        footer={mode === 'out' ? <Button label={`Log ${estimate.label.toLowerCase()} out`} onPress={logOut} testID="log-out-save" /> : undefined}
      >
        <Segmented options={MODES} value={mode} onChange={setMode} accessibilityLabel="Log type" testID="log-mode" />
        {!cat ? (
          <SkeletonList rows={3} testID="log-loading" />
        ) : mode === 'out' ? (
          <>
            {slotChips}
            <Text variant="caption" color="textSecondary">
              How big was it? A rough guess is fine.
            </Text>
            <View style={{ gap: t.spacing.sm }}>
              {QUICK_ESTIMATES.map((e, i) => (
                <Animated.View key={e.id} entering={enterAt(i, reduce)}>
                  <PressableScale
                    testID={`estimate-${e.id}`}
                    feedback="selection"
                    onPress={() => setEstimate(e)}
                    accessibilityRole="radio"
                    accessibilityLabel={`${e.label}, ${e.hint}`}
                    accessibilityState={{ selected: estimate.id === e.id }}
                    style={{
                      minHeight: t.sizes.row,
                      borderRadius: t.radius.card,
                      padding: t.spacing.card,
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: estimate.id === e.id ? t.colors.accentSoft : t.colors.surface,
                      borderWidth: t.sizes.hairline,
                      borderColor: estimate.id === e.id ? t.colors.accent : t.colors.surface,
                    }}
                  >
                    <Text variant="headline" style={{ flex: 1 }}>
                      {e.label}
                    </Text>
                    <Text variant="callout" color="textSecondary" tabular>
                      {e.hint}
                    </Text>
                  </PressableScale>
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
            <TextField
              label="Search foods"
              placeholder="Chicken, rice, banana…"
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              returnKeyType="search"
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
                <EmptyState icon={Search} title="No matches" body="Try a simpler word, like 'rice' or 'yogurt'." testID="food-none" />
              )
            ) : recent.length ? (
              <View testID="food-recent">
                <Text variant="caption" color="textSecondary">
                  Recent
                </Text>
                {recent.map((f) => (
                  <ListRow key={f.id} title={f.name} icon={Clock} onPress={() => openFood(f)} chevron testID={`recent-${f.id}`} />
                ))}
              </View>
            ) : (
              <EmptyState icon={UtensilsCrossed} title="Search 275 everyday foods" body="Nutrition from USDA FoodData Central." testID="food-hint" />
            )}
          </>
        )}

        <Sheet open={food !== null} onClose={() => setFood(null)} title={food?.name} testID="portion-sheet">
          {food ? (
            <>
              <BigNumber value={macrosForGrams(food, grams).kcal} unit="kcal" testID="portion-kcal" />
              <Text variant="caption" color="textSecondary" tabular>
                P {macrosForGrams(food, grams).p} g · C {macrosForGrams(food, grams).c} g · F {macrosForGrams(food, grams).f} g
              </Text>
              <WheelPicker items={GRAMS} value={grams} onChange={setGrams} accessibilityLabel="Portion in grams" testID="portion-wheel" />
              <Button label={`Add to ${slotLabel(slot).toLowerCase()}`} onPress={logFoodItem} testID="portion-add" />
            </>
          ) : null}
        </Sheet>
      </Screen>
    </KeyboardAvoidingView>
  );
}
