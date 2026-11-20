import { useLocalSearchParams } from 'expo-router';
import { GlassWater, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { dayLabel, isISODate, todayISO } from '@/features/meals/logic/dates';
import { addWater, undoLog } from '@/features/meals/service';
import { haptics } from '@/services/haptics';
import { useTheme } from '@/theme';
import { BackButton, BigNumber, Button, Chip, IconButton, ProgressRing, ringInnerWidth, Screen, showUndoToast, Stepper, Text } from '@/ui';

import { progress } from '../logic/intake';
import { Glass } from '../components/Glass';
import { GLASS_ML, QUICK_ADD_ML, WATER_GOAL_MAX, WATER_GOAL_MIN, formatLogTime, formatWater, glassCount, isWaterLog, totalWaterMl, waterMl } from '../logic/water';
import { useFoodLogs } from '../repo';
import { getWaterGoal, setWaterGoal } from '../waterGoal';

/** S27 Water: one-tap quick add, glasses that fill with a spring, goal you can change. */
export function WaterScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ date?: string }>();
  const today = todayISO();
  const date = isISODate(params.date) ? params.date : today;
  const logs = useFoodLogs(date).filter(isWaterLog);
  const total = totalWaterMl(logs);
  const [goal, setGoal] = useState(getWaterGoal);
  const glasses = glassCount(goal);
  const filled = Math.floor(total / GLASS_ML);

  const add = (ml: number) => {
    const before = total;
    addWater(date, ml);
    // The button / chip already gave its light tap; reaching the goal earns the success buzz.
    if (before < goal && before + ml >= goal) haptics.success();
  };

  const remove = (id: string, ml: number) => {
    undoLog(id);
    showUndoToast(`${formatWater(ml)} water removed`, () => {
      addWater(date, ml);
    });
  };
  const ring = t.sizes.ring + t.spacing.huge + t.spacing.xs;

  return (
    <Screen
      title="Water"
      headerLeft={<BackButton fallback="/eat" />}
      testID="screen-water"
      footer={<Button label={`Add a glass · ${GLASS_ML} ml`} onPress={() => add(GLASS_ML)} testID="water-add" />}
    >
      <Text variant="callout" color="textSecondary">
        {dayLabel(date, today)}
      </Text>
      <View style={{ alignItems: 'center', gap: t.spacing.sm }}>
        <ProgressRing
          progress={progress(total, goal)}
          color="accent"
          size={ring}
          strokeWidth={t.sizes.ringStroke}
          accessibilityLabel={`Water: ${formatWater(total)} of ${formatWater(goal)}`}
          testID="water-ring"
        >
          <BigNumber value={total} unit="ml" fitWidth={ringInnerWidth(ring, t.sizes.ringStroke)} center testID="water-total" />
          <Text variant="caption" color="textSecondary">
            of {formatWater(goal)}
          </Text>
        </ProgressRing>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs, justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {Array.from({ length: glasses }, (_, i) => (
          <Glass key={i} index={i} full={i < filled} size="large" />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs }}>
        {QUICK_ADD_ML.map((ml) => (
          <Chip key={ml} role="button" label={`+ ${ml} ml`} onPress={() => add(ml)} testID={`water-${ml}`} />
        ))}
      </View>
      <Stepper
        label="Daily goal"
        value={goal}
        onChange={(v) => setGoal(setWaterGoal(v))}
        min={WATER_GOAL_MIN}
        max={WATER_GOAL_MAX}
        step={250}
        format={formatWater}
        testID="water-goal"
      />
      {logs.length ? (
        <View style={{ gap: t.spacing.xxs }} testID="water-entries">
          {[...logs].reverse().map((l, i) => (
            <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', minHeight: t.sizes.touch, gap: t.spacing.sm }}>
              <GlassWater color={t.colors.textSecondary} size={t.sizes.iconSmall} strokeWidth={t.sizes.iconStroke} />
              <Text style={{ flex: 1 }} tabular>
                {formatWater(waterMl(l))}
              </Text>
              <Text variant="caption" color="textSecondary" tabular>
                {formatLogTime(l.createdAt)}
              </Text>
              <IconButton icon={Trash2} accessibilityLabel={`Remove ${formatWater(waterMl(l))}`} onPress={() => remove(l.id, waterMl(l))} color="textSecondary" testID={`water-remove-${i}`} />
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
