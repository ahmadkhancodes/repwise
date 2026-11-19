import { useState } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { BigNumber, Segmented, Stepper, Text } from '@/ui';

import { brzycki1RM, epley1RM, percentTable, type WeightUnit } from '../logic/engine';
import { trimNumber } from '../logic/units';

type Formula = 'epley' | 'brzycki';
const FORMULAS = [
  { value: 'epley', label: 'Epley' },
  { value: 'brzycki', label: 'Brzycki' },
] as const;

/** 1RM estimate (Epley / Brzycki) + % of 1RM table (RW-25), all from the engine. */
export function OneRmCalculator({ unit }: { unit: WeightUnit }) {
  const t = useTheme();
  const step = unit === 'kg' ? 2.5 : 5;
  const [weight, setWeight] = useState(unit === 'kg' ? 80 : 185);
  const [reps, setReps] = useState(5);
  const [formula, setFormula] = useState<Formula>('epley');
  const oneRm = formula === 'epley' ? epley1RM(weight, reps) : brzycki1RM(weight, reps);
  const table = percentTable(oneRm, step);

  return (
    <View style={{ gap: t.spacing.md }} testID="one-rm-calculator">
      <Stepper label="Weight lifted" value={weight} onChange={setWeight} min={step} max={unit === 'kg' ? 500 : 1100} step={step} unit={unit} format={trimNumber} testID="orm-weight" />
      <Stepper label="Reps" value={reps} onChange={setReps} min={1} max={20} step={1} unit="reps" testID="orm-reps" />
      <Segmented options={FORMULAS} value={formula} onChange={setFormula} accessibilityLabel="Formula" testID="orm-formula" />
      <BigNumber value={oneRm} decimals={1} unit={unit} label="Estimated 1RM" testID="orm-result" />
      <View>
        <View style={{ flexDirection: 'row', paddingVertical: t.spacing.xs }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {['% 1RM', unit, 'Reps'].map((h) => (
            <Text key={h} variant="caption" color="textTertiary" style={{ flex: 1 }}>
              {h}
            </Text>
          ))}
        </View>
        {table.map((r) => (
          <View
            key={r.pct}
            accessible
            accessibilityLabel={`${r.pct} percent: ${trimNumber(r.load)} ${unit}, about ${r.reps} reps`}
            style={{
              flexDirection: 'row',
              minHeight: t.sizes.touch,
              alignItems: 'center',
              borderTopWidth: t.sizes.hairline,
              borderTopColor: t.colors.border,
            }}
          >
            <Text variant="body" tabular style={{ flex: 1 }}>
              {r.pct}%
            </Text>
            <Text variant="headline" tabular style={{ flex: 1 }}>
              {trimNumber(r.load)}
            </Text>
            <Text variant="body" color="textSecondary" tabular style={{ flex: 1 }}>
              {r.reps}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
