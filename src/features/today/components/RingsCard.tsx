import { View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { useTheme, type ColorToken } from '@/theme';
import { BigNumber, Card, ProgressRing, Text } from '@/ui';

import { ratio, remaining, type DayTargets, type Nutrients } from '../logic/meals';

import { enterAt } from './motion';

const MACROS: { key: 'p' | 'c' | 'f'; label: string; color: ColorToken }[] = [
  { key: 'p', label: 'Protein', color: 'macroProtein' },
  { key: 'c', label: 'Carbs', color: 'macroCarb' },
  { key: 'f', label: 'Fat', color: 'macroFat' },
];

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/** Calories + P/C/F rings. Rings spring and the number counts whenever a meal is ticked. */
export function RingsCard({
  eaten,
  targets,
  index = 1,
}: {
  eaten: Nutrients;
  targets: DayTargets;
  index?: number;
}) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const left = remaining(eaten.kcal, targets.kcal);
  const over = eaten.kcal > targets.kcal;
  const mini = t.sizes.touch + t.spacing.xs;
  return (
    <Animated.View entering={enterAt(index, reduceMotion)}>
      <Card testID="today-rings">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.lg }}>
          <ProgressRing
            progress={ratio(eaten.kcal, targets.kcal)}
            accessibilityLabel="Calories eaten"
            testID="ring-kcal"
          >
            <Text variant="headline" tabular testID="kcal-left">
              {fmt(over ? eaten.kcal - targets.kcal : left)}
            </Text>
            <Text variant="caption" color="textSecondary">
              {over ? 'kcal over' : 'kcal left'}
            </Text>
          </ProgressRing>
          <View style={{ flex: 1 }}>
            <BigNumber value={eaten.kcal} unit="kcal" label="Eaten" testID="kcal-eaten" />
            <Text variant="callout" color="textSecondary" tabular>
              of {fmt(targets.kcal)} kcal
            </Text>
          </View>
        </View>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginTop: t.spacing.lg,
            gap: t.spacing.xs,
          }}
        >
          {MACROS.map((m) => (
            <View key={m.key} style={{ flex: 1, alignItems: 'center', gap: t.spacing.xxs }}>
              <ProgressRing
                progress={ratio(eaten[m.key], targets[m.key])}
                size={mini}
                strokeWidth={t.spacing.xs - t.spacing.xxs / 2}
                color={m.color}
                accessibilityLabel={`${m.label}, ${fmt(eaten[m.key])} of ${fmt(targets[m.key])} grams`}
                testID={`ring-${m.key}`}
              />
              <Text variant="caption" color="textSecondary">
                {m.label}
              </Text>
              <Text variant="callout" tabular testID={`macro-${m.key}`}>
                {fmt(eaten[m.key])}
                <Text variant="caption" color="textSecondary">
                  {' '}
                  / {fmt(targets[m.key])} g
                </Text>
              </Text>
            </View>
          ))}
        </View>
      </Card>
    </Animated.View>
  );
}
