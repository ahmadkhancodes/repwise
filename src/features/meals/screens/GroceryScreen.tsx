import { router, useLocalSearchParams } from 'expo-router';
import { Check, Lock, RotateCcw, Share2, ShoppingBasket } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Share, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { usePro } from '@/features/billing/hooks/usePro';
import { haptics } from '@/services/haptics';
import { useTheme } from '@/theme';
import { BigNumber, Button, EmptyState, IconButton, PressableScale, Screen, Text } from '@/ui';

import { BackButton } from '../components/BackButton';
import { SkeletonList } from '../components/SkeletonBlock';
import { enterAt, layoutSpring } from '../components/motion';
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

  const toggle = (id: string) => {
    haptics.selection();
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setGroceryChecked(weekStart, [...next]);
      if (next.size === total && total > 0) haptics.success();
      return next;
    });
  };

  const clear = () => {
    haptics.light();
    setChecked(new Set());
    setGroceryChecked(weekStart, []);
  };

  const share = () => {
    Share.share({ message: groceryText(list, checked, `Repwise grocery list · ${range}`, units) }).catch(() => undefined);
  };

  if (!isPro) {
    return (
      <Screen title="Grocery list" headerLeft={<BackButton />} testID="screen-grocery">
        <EmptyState
          icon={Lock}
          title="Your week's shopping in one tap"
          body="Pro builds the grocery list from your meal plan, grouped by aisle, with amounts merged."
          actionLabel="See Pro"
          onAction={() => router.push({ pathname: '/paywall', params: { source: 'grocery' } })}
          testID="grocery-locked"
        />
      </Screen>
    );
  }

  const loading = week.state === 'loading' || !week.catalog;
  return (
    <Screen
      title="Grocery list"
      headerLeft={<BackButton />}
      headerRight={checked.size ? <IconButton icon={RotateCcw} accessibilityLabel="Untick all" onPress={clear} testID="grocery-clear" /> : undefined}
      testID="screen-grocery"
      footer={total > 0 ? <Button label="Share list" icon={Share2} onPress={share} testID="grocery-share" /> : undefined}
    >
      {loading ? (
        <SkeletonList rows={6} testID="grocery-loading" />
      ) : total === 0 ? (
        <EmptyState
          icon={ShoppingBasket}
          title="Nothing to buy yet"
          body={week.state === 'no_profile' ? 'Finish setting up and your meal plan builds the list.' : 'No meals are planned for the rest of this week.'}
          testID="grocery-empty"
        />
      ) : (
        <>
          <BigNumber value={left} unit={left === 1 ? 'item left' : 'items left'} label={range} testID="grocery-left" />
          {list.map((aisle, ai) => (
            <Animated.View key={aisle.aisle} entering={enterAt(ai, reduce)} style={{ gap: t.spacing.xxs }}>
              <Text variant="caption" color="textSecondary" accessibilityRole="header">
                {aisle.label.toUpperCase()}
              </Text>
              <View style={{ backgroundColor: t.colors.surface, borderRadius: t.radius.card }}>
                {aisle.items.map((it, i) => {
                  const on = checked.has(it.foodId);
                  return (
                    <Animated.View key={it.foodId} layout={layoutSpring(reduce)}>
                      <PressableScale
                        testID={`grocery-item-${it.foodId}`}
                        feedback="none"
                        onPress={() => toggle(it.foodId)}
                        accessibilityRole="checkbox"
                        accessibilityLabel={`${it.name}, ${formatQty(it.grams, units)}`}
                        accessibilityState={{ checked: on }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: t.spacing.sm,
                          minHeight: t.sizes.row,
                          paddingHorizontal: t.spacing.card,
                          borderTopWidth: i === 0 ? 0 : t.sizes.hairline,
                          borderTopColor: t.colors.border,
                        }}
                      >
                        <View
                          style={{
                            width: t.spacing.xl,
                            height: t.spacing.xl,
                            borderRadius: t.radius.pill,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: on ? t.colors.accent : 'transparent',
                            borderWidth: on ? 0 : t.sizes.hairline + 1,
                            borderColor: t.colors.border,
                          }}
                        >
                          {on ? <Check color={t.colors.onAccent} size={t.sizes.iconSmall} strokeWidth={t.sizes.iconStroke} /> : null}
                        </View>
                        <Text
                          style={{ flex: 1, textDecorationLine: on ? 'line-through' : 'none' }}
                          color={on ? 'textTertiary' : 'textPrimary'}
                        >
                          {it.name}
                        </Text>
                        <Text variant="callout" color="textSecondary" tabular>
                          {formatQty(it.grams, units)}
                        </Text>
                      </PressableScale>
                    </Animated.View>
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
