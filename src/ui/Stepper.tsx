import { Minus, Plus } from 'lucide-react-native';
import { View } from 'react-native';

import { haptics } from '@/services/haptics';
import { useTheme } from '@/theme';

import { IconButton } from './IconButton';
import { Text } from './Text';

export type StepperProps = {
  /** Name of the value, e.g. "Weight". Used in button labels. */
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  format?: (value: number) => string;
  testID?: string;
};

/** Clamp + snap a stepped value, avoiding float drift (2.5 kg plates etc.). Pure. */
export function stepValue(value: number, delta: number, min: number, max: number): number {
  const next = Math.round((value + delta) * 1000) / 1000;
  return Math.min(max, Math.max(min, next));
}

/** − value + control for weights/reps. Adjustable for screen readers (swipe up/down). */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  unit,
  format = String,
  testID,
}: StepperProps) {
  const t = useTheme();
  const text = format(value);
  const spoken = unit ? `${text} ${unit}` : text;

  const change = (delta: number) => {
    const next = stepValue(value, delta, min, max);
    if (next === value) return;
    haptics.selection();
    onChange(next);
  };

  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: t.colors.surface,
        borderRadius: t.radius.button,
        minHeight: t.sizes.button,
        paddingHorizontal: t.spacing.xxs,
      }}
    >
      <IconButton
        icon={Minus}
        feedback="none"
        accessibilityLabel={`Decrease ${label}`}
        disabled={value <= min}
        onPress={() => change(-step)}
        testID={testID ? `${testID}-dec` : undefined}
      />
      <View
        style={{ flex: 1, alignItems: 'center' }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: spoken }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) =>
          change(e.nativeEvent.actionName === 'increment' ? step : -step)
        }
      >
        <Text variant="title2" tabular testID={testID ? `${testID}-value` : undefined}>
          {text}
          {unit ? (
            <Text variant="callout" color="textSecondary">
              {` ${unit}`}
            </Text>
          ) : null}
        </Text>
      </View>
      <IconButton
        icon={Plus}
        feedback="none"
        accessibilityLabel={`Increase ${label}`}
        disabled={value >= max}
        onPress={() => change(step)}
        testID={testID ? `${testID}-inc` : undefined}
      />
    </View>
  );
}
