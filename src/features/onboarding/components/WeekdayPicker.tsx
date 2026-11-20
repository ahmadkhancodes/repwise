import { Check } from 'lucide-react-native';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { PressableScale, Text } from '@/ui';

import { WEEKDAY_LONG, WEEKDAY_SHORT } from '../logic/options';

type Props = {
  selected: readonly number[];
  onToggle: (weekday: number) => void;
  /** 0 = Monday; marked "today" in the spoken label and with a bold outline. */
  today?: number;
  testID?: string;
};

/**
 * Seven training-day toggles, Monday first (multi-select). Pure flex like the shared WeekStrip:
 * each cell is flex 1 (min width 0) with a 48dp minimum height, so the row fits a 360dp screen
 * at 130% font. Selected = inverse pill with a check (date-pill rule, D-ONB); unselected =
 * borderStrong outline (≥ 3:1).
 */
export function WeekdayPicker({ selected, onToggle, today, testID }: Props) {
  const t = useTheme();
  return (
    <View
      testID={testID}
      accessibilityRole="none"
      style={{ flexDirection: 'row', gap: t.spacing.xxs, alignSelf: 'stretch' }}
    >
      {WEEKDAY_SHORT.map((d, i) => {
        const on = selected.includes(i);
        const isToday = i === today;
        return (
          <PressableScale
            key={d}
            testID={testID ? `${testID}-${i}` : undefined}
            onPress={() => onToggle(i)}
            feedback="selection"
            accessibilityRole="checkbox"
            accessibilityLabel={isToday ? `${WEEKDAY_LONG[i]}, today` : WEEKDAY_LONG[i]}
            accessibilityState={{ checked: on }}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: t.sizes.touch + t.spacing.md,
              paddingVertical: t.spacing.xs,
              borderRadius: t.radius.card,
              alignItems: 'center',
              justifyContent: 'center',
              gap: t.spacing.xxs,
              backgroundColor: on ? t.colors.inverse : t.colors.surface,
              borderWidth: on ? 0 : isToday ? t.sizes.borderThick : t.sizes.hairline,
              borderColor: isToday ? t.colors.textPrimary : t.colors.borderStrong,
            }}
          >
            <Text
              variant="callout"
              color={on ? 'onInverse' : 'textPrimary'}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {d.slice(0, 2)}
            </Text>
            <View
              style={{ height: t.sizes.iconSmall, alignItems: 'center', justifyContent: 'center' }}
            >
              {on ? (
                <Check
                  color={t.colors.accentOnInverse}
                  size={t.sizes.iconSmall}
                  strokeWidth={t.sizes.iconStrokeBold}
                />
              ) : null}
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}
