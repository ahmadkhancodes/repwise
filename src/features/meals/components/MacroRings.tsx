import { View } from 'react-native';

import { progress, remaining } from '@/features/nutrition/logic/intake';
import { useTheme, type ColorToken } from '@/theme';
import { BigNumber, ProgressRing, Text } from '@/ui';

export type RingTotals = { kcal: number; protein: number; carbs: number; fat: number };

type Props = {
  eaten: RingTotals;
  target: RingTotals;
  testID?: string;
};

const MACROS: { key: 'protein' | 'carbs' | 'fat'; label: string; color: ColorToken }[] = [
  { key: 'protein', label: 'Protein', color: 'macroProtein' },
  { key: 'carbs', label: 'Carbs', color: 'macroCarb' },
  { key: 'fat', label: 'Fat', color: 'macroFat' },
];

/** Sheet 11 MacroRings: big kcal ring with the count-up number, plus P/C/F rings. */
export function MacroRings({ eaten, target, testID }: Props) {
  const t = useTheme();
  const kcalLeft = remaining(eaten.kcal, target.kcal);
  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.lg }}>
      <ProgressRing
        progress={progress(eaten.kcal, target.kcal)}
        accessibilityLabel={`Calories: ${Math.round(eaten.kcal)} of ${Math.round(target.kcal)}`}
        size={t.sizes.ring + t.spacing.xl}
      >
        <BigNumber value={kcalLeft.over ? kcalLeft.over : kcalLeft.left} testID={testID ? `${testID}-kcal` : undefined} />
        <Text variant="caption" color="textSecondary">
          {kcalLeft.over ? 'kcal over' : 'kcal left'}
        </Text>
      </ProgressRing>
      <View style={{ flex: 1, gap: t.spacing.sm }}>
        {MACROS.map((m) => (
          <View key={m.key} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
            <ProgressRing
              progress={progress(eaten[m.key], target[m.key])}
              color={m.color}
              size={t.sizes.touch - t.spacing.xs}
              strokeWidth={t.spacing.xxs + 1}
              accessibilityLabel={`${m.label}: ${Math.round(eaten[m.key])} of ${Math.round(target[m.key])} grams`}
            />
            <View style={{ flex: 1 }}>
              <Text variant="callout">{m.label}</Text>
              <Text variant="caption" color="textSecondary" tabular>
                {Math.round(eaten[m.key])} / {Math.round(target[m.key])} g
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
