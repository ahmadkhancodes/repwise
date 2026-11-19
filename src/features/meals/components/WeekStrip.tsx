import { View } from 'react-native';

import { useTheme } from '@/theme';
import { PressableScale, Text } from '@/ui';

import { dayLabel, dayOfMonth, shortWeekday } from '../logic/dates';

type Props = {
  dates: readonly string[];
  selected: string;
  today: string;
  /** Dates with every meal ticked get a filled dot. */
  done?: ReadonlySet<string>;
  locked?: (date: string) => boolean;
  onSelect: (date: string) => void;
};

/** Seven day pills (Mon–Sun). Selection haptic, inverse fill for the selected day. */
export function WeekStrip({ dates, selected, today, done, locked, onSelect }: Props) {
  const t = useTheme();
  return (
    <View testID="week-strip" style={{ flexDirection: 'row', gap: t.spacing.xxs }}>
      {dates.map((d) => {
        const isSel = d === selected;
        const isToday = d === today;
        return (
          <PressableScale
            key={d}
            testID={`day-${d}`}
            feedback="selection"
            onPress={() => onSelect(d)}
            accessibilityRole="tab"
            accessibilityLabel={`${dayLabel(d, today)}${locked?.(d) ? ', Pro' : ''}`}
            accessibilityState={{ selected: isSel }}
            style={{
              flex: 1,
              minHeight: t.sizes.touch + t.spacing.md,
              borderRadius: t.radius.card,
              alignItems: 'center',
              justifyContent: 'center',
              gap: t.spacing.xxs,
              backgroundColor: isSel ? t.colors.inverse : t.colors.surface,
            }}
          >
            <Text variant="caption" color={isSel ? 'onInverse' : 'textSecondary'}>
              {shortWeekday(d)}
            </Text>
            <Text variant="headline" color={isSel ? 'onInverse' : isToday ? 'accentText' : 'textPrimary'} tabular>
              {dayOfMonth(d)}
            </Text>
            <View
              style={{
                width: t.spacing.xxs + 2,
                height: t.spacing.xxs + 2,
                borderRadius: t.radius.pill,
                backgroundColor: done?.has(d) ? t.colors.accent : 'transparent',
              }}
            />
          </PressableScale>
        );
      })}
    </View>
  );
}
