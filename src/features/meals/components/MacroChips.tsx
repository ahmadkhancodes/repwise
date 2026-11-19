import { View } from 'react-native';

import { useTheme, type ColorToken } from '@/theme';
import { Text } from '@/ui';

const MACROS: { key: 'protein' | 'carbs' | 'fat'; short: string; color: ColorToken }[] = [
  { key: 'protein', short: 'P', color: 'macroProtein' },
  { key: 'carbs', short: 'C', color: 'macroCarb' },
  { key: 'fat', short: 'F', color: 'macroFat' },
];

type Props = { protein: number; carbs: number; fat: number; kcal?: number; testID?: string };

/** "640 kcal · P 48 · C 65 · F 21" with macro colour dots (sheet 11 MealTile chips). */
export function MacroChips({ protein, carbs, fat, kcal, testID }: Props) {
  const t = useTheme();
  const values = { protein, carbs, fat };
  const spoken = `${kcal !== undefined ? `${Math.round(kcal)} calories, ` : ''}protein ${Math.round(protein)} grams, carbs ${Math.round(carbs)} grams, fat ${Math.round(fat)} grams`;
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={spoken}
      style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.spacing.sm }}
    >
      {kcal !== undefined ? (
        <Text variant="callout" tabular>
          {Math.round(kcal)} kcal
        </Text>
      ) : null}
      {MACROS.map((m) => (
        <View key={m.key} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xxs }}>
          <View
            style={{
              width: t.spacing.xs,
              height: t.spacing.xs,
              borderRadius: t.radius.pill,
              backgroundColor: t.colors[m.color],
            }}
          />
          <Text variant="caption" color="textSecondary" tabular>
            {m.short} {Math.round(values[m.key])}g
          </Text>
        </View>
      ))}
    </View>
  );
}
