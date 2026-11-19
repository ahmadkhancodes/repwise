import { useLocalSearchParams } from 'expo-router';
import { GlassWater, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { BackButton } from '@/features/meals/components/BackButton';
import { dayLabel, isISODate, todayISO } from '@/features/meals/logic/dates';
import { addWater, undoLog } from '@/features/meals/service';
import { haptics } from '@/services/haptics';
import { useTheme } from '@/theme';
import { BigNumber, Button, Chip, IconButton, ProgressRing, Screen, Stepper, Text } from '@/ui';

import { progress } from '../logic/intake';
import { GLASS_ML, QUICK_ADD_ML, WATER_GOAL_MAX, WATER_GOAL_MIN, formatWater, glassCount, isWaterLog, totalWaterMl, waterMl } from '../logic/water';
import { useFoodLogs } from '../repo';
import { getWaterGoal, setWaterGoal } from '../waterGoal';

function Glass({ full, index }: { full: boolean; index: number }) {
  const t = useTheme();
  const reduce = useReducedMotion();
  const s = useSharedValue(full ? 1 : 0);
  useEffect(() => {
    s.set(reduce ? (full ? 1 : 0) : withSpring(full ? 1 : 0, t.motion.spring));
  }, [full, reduce, s, t.motion.spring]);
  const fill = useAnimatedStyle(() => ({ transform: [{ scaleY: s.value }], opacity: 0.3 + 0.7 * s.value }));
  return (
    <View
      testID={`glass-${index}`}
      style={{
        width: t.spacing.xxxl - t.spacing.xxs,
        height: t.spacing.huge,
        borderRadius: t.radius.button,
        borderWidth: t.sizes.hairline + 1,
        borderColor: full ? t.colors.macroProtein : t.colors.border,
        overflow: 'hidden',
        justifyContent: 'flex-end',
      }}
    >
      <Animated.View style={[{ height: '100%', backgroundColor: t.colors.macroProtein, transformOrigin: 'bottom' }, fill]} />
    </View>
  );
}

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
    if (before < goal && before + ml >= goal) haptics.success();
    else haptics.light();
  };

  return (
    <Screen
      title="Water"
      headerLeft={<BackButton />}
      testID="screen-water"
      footer={<Button label={`Add a glass · ${GLASS_ML} ml`} onPress={() => add(GLASS_ML)} testID="water-add" />}
    >
      <Text variant="caption" color="textSecondary">
        {dayLabel(date, today)}
      </Text>
      <View style={{ alignItems: 'center', gap: t.spacing.sm }}>
        <ProgressRing
          progress={progress(total, goal)}
          color="macroProtein"
          size={t.sizes.ring * 1.5}
          accessibilityLabel={`Water: ${formatWater(total)} of ${formatWater(goal)}`}
          testID="water-ring"
        >
          <BigNumber value={total} unit="ml" testID="water-total" />
          <Text variant="caption" color="textSecondary">
            of {formatWater(goal)}
          </Text>
        </ProgressRing>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs, justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {Array.from({ length: glasses }, (_, i) => (
          <Glass key={i} index={i} full={i < filled} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs }}>
        {QUICK_ADD_ML.map((ml) => (
          <Chip key={ml} label={`+ ${ml} ml`} onPress={() => add(ml)} testID={`water-${ml}`} />
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
                {new Date(l.createdAt).toTimeString().slice(0, 5)}
              </Text>
              <IconButton icon={Trash2} accessibilityLabel={`Remove ${formatWater(waterMl(l))}`} onPress={() => undoLog(l.id)} color="textSecondary" testID={`water-remove-${i}`} />
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
