import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Chip, Text } from '@/ui';

import type { Option } from '../logic/options';

type Props<T extends string> = {
  label?: string;
  options: readonly Option<T>[];
  selected: readonly T[];
  onChange: (next: T[]) => void;
  /** Adds a "None" chip that clears the selection. */
  noneLabel?: string;
  testID?: string;
};

/** Multi-select chips that wrap; selection toggles with a selection haptic (Chip). */
export function ChipGroup<T extends string>({
  label,
  options,
  selected,
  onChange,
  noneLabel,
  testID,
}: Props<T>) {
  const t = useTheme();
  const toggle = (v: T) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  return (
    <View testID={testID} style={{ gap: t.spacing.sm }}>
      {label ? (
        <Text variant="headline" accessibilityRole="header">
          {label}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs }}>
        {noneLabel ? (
          <Chip
            label={noneLabel}
            selected={selected.length === 0}
            onPress={() => onChange([])}
            testID={testID ? `${testID}-none` : undefined}
          />
        ) : null}
        {options.map((o) => (
          <Chip
            key={o.value}
            label={o.label}
            selected={selected.includes(o.value)}
            onPress={() => toggle(o.value)}
            testID={testID ? `${testID}-${o.value}` : undefined}
          />
        ))}
      </View>
    </View>
  );
}
