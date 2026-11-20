import { View } from 'react-native';

import { useTheme, type ColorToken } from '@/theme';

import { BigNumber } from './BigNumber';
import { ringInnerWidth } from './fit';
import { ProgressRing } from './ProgressRing';
import { Text } from './Text';

export type MacroTotals = { kcal: number; protein: number; carbs: number; fat: number };

const MACROS: { key: 'protein' | 'carbs' | 'fat'; label: string; color: ColorToken }[] = [
  { key: 'protein', label: 'Protein', color: 'macroProtein' },
  { key: 'carbs', label: 'Carbs', color: 'macroCarb' },
  { key: 'fat', label: 'Fat', color: 'macroFat' },
];

/**
 * Display model for the rings: fill ratios and kcal left/over. Display-only arithmetic (the
 * targets themselves come from @repwise/engine). Pure, unit-tested.
 */
export function macroRingModel(eaten: MacroTotals, target: MacroTotals) {
  const ratio = (e: number, tg: number) => (tg > 0 && Number.isFinite(e) ? Math.max(0, e / tg) : 0);
  const diff = Math.round(target.kcal - eaten.kcal);
  return {
    kcal: ratio(eaten.kcal, target.kcal),
    protein: ratio(eaten.protein, target.protein),
    carbs: ratio(eaten.carbs, target.carbs),
    fat: ratio(eaten.fat, target.fat),
    kcalValue: Math.abs(diff),
    over: diff < 0,
  };
}

export type MacroRingsProps = {
  eaten: MacroTotals;
  target: MacroTotals;
  /** 'default' = big kcal ring + P/C/F rows (Eat, Today); 'compact' = smaller kcal ring. */
  size?: 'default' | 'compact';
  testID?: string;
};

/**
 * Sheet 11 MacroRings: kcal ring with a count-up "kcal left" number that auto-fits its ring at
 * any font scale, plus small protein / carbs / fat rings with grams. Fits 360dp.
 */
export function MacroRings({ eaten, target, size = 'default', testID }: MacroRingsProps) {
  const t = useTheme();
  const m = macroRingModel(eaten, target);
  const ring = size === 'compact' ? t.sizes.ring : t.sizes.ring + t.spacing.xl;
  const stroke = t.sizes.ringStroke;
  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.lg }}>
      <ProgressRing
        progress={m.kcal}
        // Over target: the full ring turns warning so it never reads as "done" (P2-22).
        color={m.over ? 'warning' : undefined}
        size={ring}
        strokeWidth={stroke}
        accessibilityLabel={`Calories: ${Math.round(eaten.kcal)} of ${Math.round(target.kcal)}, ${m.kcalValue} ${m.over ? 'over' : 'left'}`}
        testID={testID ? `${testID}-kcal-ring` : undefined}
      >
        <BigNumber
          value={m.kcalValue}
          variant={size === 'compact' ? 'title1' : 'display'}
          fitWidth={ringInnerWidth(ring, stroke)}
          center
          testID={testID ? `${testID}-kcal` : undefined}
        />
        <Text
          variant="caption"
          color="textSecondary"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={{ maxWidth: ringInnerWidth(ring, stroke) }}
        >
          {m.over ? 'kcal over' : 'kcal left'}
        </Text>
      </ProgressRing>
      <View style={{ flex: 1, minWidth: 0, gap: t.spacing.sm }}>
        {MACROS.map((mac) => (
          <View
            key={mac.key}
            style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}
          >
            <ProgressRing
              progress={m[mac.key]}
              color={mac.color}
              size={t.sizes.touch - t.spacing.xs}
              strokeWidth={t.sizes.ringStrokeThin}
              accessibilityLabel={`${mac.label}: ${Math.round(eaten[mac.key])} of ${Math.round(target[mac.key])} grams`}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="callout" numberOfLines={1}>
                {mac.label}
              </Text>
              <Text variant="caption" color="textSecondary" tabular numberOfLines={1}>
                {Math.round(eaten[mac.key])} / {Math.round(target[mac.key])} g
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
