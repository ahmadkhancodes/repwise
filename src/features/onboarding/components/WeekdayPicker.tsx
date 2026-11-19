import { View } from 'react-native';

import { useTheme } from '@/theme';
import { PressableScale, Text } from '@/ui';

import { WEEKDAY_LONG, WEEKDAY_SHORT } from '../logic/options';

type Props = {
  selected: readonly number[];
  onToggle: (weekday: number) => void;
  /** 0 = Monday; highlighted with a ring. */
  today?: number;
  testID?: string;
};

/** Seven round day toggles (48dp each), Monday first. */
export function WeekdayPicker({ selected, onToggle, today, testID }: Props) {
  const t = useTheme();
  return (
    <View testID={testID} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {WEEKDAY_SHORT.map((d, i) => {
        const on = selected.includes(i);
        return (
          <PressableScale
            key={d}
            testID={testID ? `${testID}-${i}` : undefined}
            onPress={() => onToggle(i)}
            feedback="selection"
            accessibilityRole="checkbox"
            accessibilityLabel={i === today ? `${WEEKDAY_LONG[i]}, today` : WEEKDAY_LONG[i]}
            accessibilityState={{ checked: on }}
            style={{
              width: t.sizes.touch,
              height: t.sizes.touch,
              borderRadius: t.radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? t.colors.inverse : t.colors.surface,
              borderWidth: t.sizes.hairline * 2,
              borderColor: i === today ? t.colors.accent : on ? t.colors.inverse : t.colors.border,
            }}
          >
            <Text
              variant="caption"
              style={{ color: on ? t.colors.onInverse : t.colors.textPrimary }}
            >
              {d.slice(0, 2)}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}
