import { useState } from 'react';
import { View } from 'react-native';
import Animated, { LinearTransition, ZoomIn } from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { Card, Chip, Stepper, Text } from '@/ui';

import { DEFAULT_BAR, DEFAULT_PLATES, platesPerSide, type WeightUnit } from '../logic/engine';
import { trimNumber } from '../logic/units';

const BARS: Record<WeightUnit, number[]> = { kg: [20, 15, 10], lb: [45, 35, 25] };

/** Plates per side for any bar (RW-25, engine `platesPerSide`), drawn as a loaded sleeve. */
export function PlateCalculator({ unit, initial }: { unit: WeightUnit; initial?: number }) {
  const t = useTheme();
  const [bar, setBar] = useState(DEFAULT_BAR[unit]);
  const step = unit === 'kg' ? 2.5 : 5;
  const [target, setTarget] = useState(initial ?? (unit === 'kg' ? 100 : 225));
  const res = platesPerSide(target, { unit, bar });
  const biggest = Math.max(...DEFAULT_PLATES[unit]);
  const sleeveH = t.sizes.hitGymLarge + t.spacing.xl;

  return (
    <View style={{ gap: t.spacing.md }} testID="plate-calculator">
      <Stepper
        label="Target weight"
        value={target}
        onChange={setTarget}
        min={bar}
        max={unit === 'kg' ? 500 : 1100}
        step={step}
        unit={unit}
        format={trimNumber}
        testID="plate-target"
      />
      <View style={{ gap: t.spacing.xs }}>
        <Text variant="callout" color="textSecondary">
          Bar
        </Text>
        <View style={{ flexDirection: 'row', gap: t.spacing.xs, flexWrap: 'wrap' }}>
          {BARS[unit].map((b) => (
            <Chip
              key={b}
              label={`${b} ${unit}`}
              selected={bar === b}
              onPress={() => {
                setBar(b);
                if (target < b) setTarget(b);
              }}
              testID={`bar-${b}`}
            />
          ))}
        </View>
      </View>

      <Card>
        <View
          accessible
          accessibilityLabel={
            res.perSide.length
              ? `Each side: ${res.perSide.map(trimNumber).join(', ')} ${unit}`
              : 'Just the bar'
          }
          style={{ flexDirection: 'row', alignItems: 'center', minHeight: sleeveH, gap: t.spacing.xxs }}
        >
          <View style={{ width: t.spacing.xxl, height: t.spacing.xs, borderRadius: t.radius.pill, backgroundColor: t.colors.borderStrong }} />
          <View style={{ width: t.spacing.xs, height: t.spacing.xl, borderRadius: t.radius.pill, backgroundColor: t.colors.borderStrong }} />
          {res.perSide.map((p, i) => (
            <Animated.View
              key={`${i}-${p}`}
              entering={ZoomIn.springify().damping(t.motion.spring.damping).stiffness(t.motion.spring.stiffness)}
              layout={LinearTransition.springify().damping(t.motion.spring.damping)}
              style={{
                width: t.spacing.md + (p / biggest) * t.spacing.xs,
                height: Math.max(t.spacing.xl, (p / biggest) * sleeveH),
                borderRadius: t.radius.button / 2,
                backgroundColor: p === biggest ? t.colors.accent : t.colors.inverse,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            />
          ))}
          <View style={{ flex: 1, height: t.spacing.xs, borderRadius: t.radius.pill, backgroundColor: t.colors.borderStrong }} />
        </View>
        <Text variant="title2" tabular testID="plate-per-side" style={{ marginTop: t.spacing.sm }}>
          {res.perSide.length ? res.perSide.map(trimNumber).join(' + ') : 'Just the bar'}
        </Text>
        <Text variant="callout" color="textSecondary">
          {res.perSide.length ? `${unit} on each side` : `${trimNumber(bar)} ${unit} bar`}
        </Text>
        {res.remainder > 0 ? (
          <Text variant="callout" color="textSecondary" testID="plate-remainder" style={{ marginTop: t.spacing.xxs }}>
            Closest you can load: {trimNumber(res.achieved)} {unit}
          </Text>
        ) : null}
      </Card>
    </View>
  );
}
