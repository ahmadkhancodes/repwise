import { useLocalSearchParams } from 'expo-router';
import { Lock, RotateCcw, Share2, ShoppingBasket } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Share, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { openGate } from '@/features/billing';
import { usePro } from '@/features/billing/hooks/usePro';
import { haptics } from '@/services/haptics';
import { useTheme } from '@/theme';
import {
  BackButton,
  BigNumber,
  Button,
  Checkbox,
  EmptyState,
  IconButton,
  Screen,
  SectionHeader,
  SkeletonCard,
  SkeletonGroup,
  Text,
} from '@/ui';

import { enterAt } from '@/ui/listMotion';
import { useEatWeek } from '../hooks/useEat';
import { addDays, isISODate, shortDate, startOfWeek, todayISO } from '../logic/dates';
import { buildGroceryList, formatQty, groceryCount, groceryText } from '../logic/grocery';
import { getGroceryChecked, setGroceryChecked } from '../signals';

/** S25 Grocery list (W7 "Grocery magic"): the week's meals merged by ingredient, grouped by aisle. */
export function GroceryScreen() {
  const t = useTheme();
  const reduce = useReducedMotion();
  const { isPro } = usePro();
  const params = useLocalSearchParams<{ week?: string }>();
  const today = todayISO();
  const weekStart = startOfWeek(isISODate(params.week) ? params.week : today);
  const week = useEatWeek(weekStart);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(getGroceryChecked(weekStart)));
  const units = week.profile?.units ?? 'metric';

  const list = useMemo(() => {
    if (!week.catalog) return [];
    const meals = week.days.filter((d) => d.date >= today).flatMap((d) => d.meals);
    return buildGroceryList(meals, week.catalog.recipeById, week.catalog.foodById);
  }, [week.catalog, week.days, today]);

  const total = groceryCount(list);
  const left = list.reduce((n, a) => n + a.items.filter((i) => !checked.has(i.foodId)).length, 0);
  const range = `${shortDate(weekStart)} – ${shortDate(addDays(weekStart, 6))}`;

  // The Checkbox owns the selection haptic; the last item ticked earns the success buzz.
  const toggle = (id: string) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setGroceryChecked(weekStart, [...next]);
    setChecked(next);
    if (next.size === total && total > 0 && !checked.has(id)) haptics.light();
  };

  const clear = () => {
    setChecked(new Set());
    setGroceryChecked(weekStart, []);
  };

  const share = () => {
    Share.share({
      message: groceryText(list, checked, `Repwise grocery list · ${range}`, units),
    }).catch(() => undefined);
  };

  if (!isPro) {
    return (
      <Screen
        title="Grocery list"
        headerLeft={<BackButton fallback="/eat" />}
        testID="screen-grocery"
      >
        <EmptyState
          icon={Lock}
          title="Your week’s shopping in one tap"
          body="Pro builds the grocery list from your meal plan, grouped by aisle, with amounts merged."
          actionLabel="See Pro"
          onAction={() => openGate('grocery')}
          testID="grocery-locked"
        />
      </Screen>
    );
  }

  const loading = week.state === 'loading' || !week.catalog;
  return (
    <Screen
      title="Grocery list"
      headerLeft={<BackButton fallback="/eat" />}
      headerRight={
        checked.size ? (
          <IconButton
            icon={RotateCcw}
            accessibilityLabel="Untick all"
            onPress={clear}
            testID="grocery-clear"
          />
        ) : undefined
      }
      testID="screen-grocery"
      footer={
        total > 0 ? (
          <Button label="Share list" icon={Share2} onPress={share} testID="grocery-share" />
        ) : undefined
      }
    >
      {loading ? (
        <SkeletonGroup testID="grocery-loading" style={{ gap: t.spacing.sm }}>
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonCard key={i} lines={2} />
          ))}
        </SkeletonGroup>
      ) : total === 0 ? (
        <EmptyState
          icon={ShoppingBasket}
          title="Nothing to buy yet"
          body={
            week.state === 'no_profile'
              ? 'Finish setting up and your meal plan builds the list.'
              : 'No meals are planned for the rest of this week.'
          }
          testID="grocery-empty"
        />
      ) : (
        <>
          <BigNumber
            value={left}
            unit={left === 1 ? 'item left' : 'items left'}
            label={range}
            testID="grocery-left"
          />
          {list.map((aisle, ai) => (
            <Animated.View
              key={aisle.aisle}
              entering={enterAt(ai, reduce)}
              style={{ gap: t.spacing.xxs }}
            >
              <View style={{ marginTop: t.spacing.xs }}>
                <SectionHeader title={aisle.label} level="card" />
              </View>
              <View style={{ backgroundColor: t.colors.surface, borderRadius: t.radius.card }}>
                {aisle.items.map((it, i) => {
                  const on = checked.has(it.foodId);
                  return (
                    <View
                      key={it.foodId}
                      style={{
                        paddingHorizontal: t.spacing.card,
                        borderTopWidth: i === 0 ? 0 : t.sizes.hairline,
                        borderTopColor: t.colors.border,
                      }}
                    >
                      <Checkbox
                        checked={on}
                        onChange={() => toggle(it.foodId)}
                        label={it.name}
                        strikeWhenChecked
                        trailing={
                          <Text variant="callout" color="textSecondary" tabular>
                            {formatQty(it.grams, units)}
                          </Text>
                        }
                        testID={`grocery-item-${it.foodId}`}
                      />
                    </View>
                  );
                })}
              </View>
            </Animated.View>
          ))}
        </>
      )}
    </Screen>
  );
}
