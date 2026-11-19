import { router, useLocalSearchParams } from 'expo-router';
import { CircleAlert, NotebookPen, Trash2 } from 'lucide-react-native';
import { View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { BackButton } from '@/features/meals/components/BackButton';
import { MacroChips } from '@/features/meals/components/MacroChips';
import { MacroRings } from '@/features/meals/components/MacroRings';
import { SkeletonList } from '@/features/meals/components/SkeletonBlock';
import { enterAt, layoutSpring } from '@/features/meals/components/motion';
import { useEatDay, type MealView } from '@/features/meals/hooks/useEat';
import { dayLabel, isISODate, todayISO } from '@/features/meals/logic/dates';
import { slotLabel } from '@/features/meals/logic/slots';
import { markMealEaten, setMealOpen } from '@/features/meals/service';
import { haptics } from '@/services/haptics';
import { useTheme } from '@/theme';
import { Button, Card, Chip, EmptyState, IconButton, Screen, Text, showToast } from '@/ui';

import { isWaterLog } from '../logic/water';
import { logFood, removeLog, type FoodLog } from '../repo';

const SOURCE_LABEL: Record<string, string> = { plan: 'From plan', search: 'Food', quick: 'Estimate' };

/** S26 Nutrition day log: rings, planned meals (ate it / half / skipped) and everything logged. */
export function DayLogScreen() {
  const t = useTheme();
  const reduce = useReducedMotion();
  const params = useLocalSearchParams<{ date?: string }>();
  const today = todayISO();
  const date = isISODate(params.date) ? params.date : today;
  const day = useEatDay(date);
  const logs = day.logs.filter((l) => !isWaterLog(l));

  const setMeal = (m: MealView, action: 'eaten' | 'half' | 'skipped') => {
    if (action === 'skipped') {
      setMealOpen(m.id, m.status === 'skipped' ? 'planned' : 'skipped');
      haptics.selection();
      return;
    }
    if (m.status === 'eaten' && action === 'eaten') {
      setMealOpen(m.id, 'planned');
      haptics.selection();
      return;
    }
    markMealEaten(m.id, action === 'half' ? 0.5 : 1);
    haptics.success();
  };

  const remove = (l: FoodLog) => {
    removeLog(l.id);
    haptics.light();
    showToast({
      message: `${l.name} removed`,
      actionLabel: 'Undo',
      onAction: () => logFood({ date: l.date, source: l.source, name: l.name, slot: l.slot, kcal: l.kcal, p: l.p, c: l.c, f: l.f }),
    });
  };

  const halfOf = (m: MealView) => logs.find((l) => l.source === 'plan' && l.slot === m.slot && l.kcal < m.kcal * 0.75);

  return (
    <Screen
      title={dayLabel(date, today)}
      headerLeft={<BackButton />}
      testID="screen-day-log"
      footer={<Button label="Log food" onPress={() => router.push({ pathname: '/meal/log', params: { date, mode: 'food' } })} testID="day-log-add" />}
    >
      {day.state === 'loading' ? (
        <SkeletonList rows={3} testID="day-log-loading" />
      ) : day.state === 'error' ? (
        <EmptyState icon={CircleAlert} title="Couldn't load this day" actionLabel="Try again" onAction={day.retry} testID="day-log-error" />
      ) : (
        <>
          <Card testID="day-log-rings">
            <MacroRings
              eaten={{ kcal: day.intake.kcal, protein: day.intake.p, carbs: day.intake.c, fat: day.intake.f }}
              target={day.targets ?? { kcal: Math.max(day.intake.kcal, 1), protein: Math.max(day.intake.p, 1), carbs: Math.max(day.intake.c, 1), fat: Math.max(day.intake.f, 1) }}
            />
          </Card>

          {day.meals.length ? (
            <>
              <Text variant="title2" accessibilityRole="header">
                Planned
              </Text>
              {day.meals.map((m, i) => {
                const half = m.status === 'eaten' && Boolean(halfOf(m));
                return (
                  <Animated.View key={m.id} entering={enterAt(i, reduce)} layout={layoutSpring(reduce)}>
                    <Card testID={`day-meal-${m.slot}`}>
                      <Text variant="caption" color="textSecondary">
                        {slotLabel(m.slot)}
                      </Text>
                      <Text variant="headline" numberOfLines={2}>
                        {m.title}
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs, marginTop: t.spacing.xs }}>
                        <Chip label="Ate it" selected={m.status === 'eaten' && !half} onPress={() => setMeal(m, 'eaten')} testID={`ate-${m.slot}`} />
                        <Chip label="Half" selected={half} onPress={() => setMeal(m, 'half')} testID={`half-${m.slot}`} />
                        <Chip label="Skipped" selected={m.status === 'skipped'} onPress={() => setMeal(m, 'skipped')} testID={`skip-${m.slot}`} />
                      </View>
                    </Card>
                  </Animated.View>
                );
              })}
            </>
          ) : null}

          <Text variant="title2" accessibilityRole="header">
            Logged
          </Text>
          {logs.length === 0 ? (
            <EmptyState icon={NotebookPen} title="Nothing logged yet" body="Tick a planned meal or log food to see it here." testID="day-log-empty" />
          ) : (
            <View style={{ gap: t.spacing.xs }} testID="day-log-items">
              {logs.map((l, i) => (
                <Animated.View key={l.id} entering={enterAt(i, reduce)} layout={layoutSpring(reduce)}>
                  <View
                    style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, backgroundColor: t.colors.surface, borderRadius: t.radius.card, paddingLeft: t.spacing.card, paddingVertical: t.spacing.xs }}
                    testID={`log-${i}`}
                  >
                    <View style={{ flex: 1, gap: t.spacing.xxs }}>
                      <Text variant="caption" color="textSecondary">
                        {[l.slot ? slotLabel(l.slot) : null, SOURCE_LABEL[l.source]].filter(Boolean).join(' · ')}
                      </Text>
                      <Text variant="headline" numberOfLines={2}>
                        {l.name}
                      </Text>
                      <MacroChips kcal={l.kcal} protein={l.p ?? 0} carbs={l.c ?? 0} fat={l.f ?? 0} />
                    </View>
                    <IconButton icon={Trash2} accessibilityLabel={`Remove ${l.name}`} onPress={() => remove(l)} color="textSecondary" testID={`remove-${i}`} />
                  </View>
                </Animated.View>
              ))}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}
