import { Check } from 'lucide-react-native';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { PressableScale, Text } from '@/ui';

import { dayOfMonth, longWeekday, shortWeekday } from '../logic/dates';
import type { DayState } from '../logic/week';

const SPOKEN: Record<DayState, string> = {
  done: 'workout done',
  active: 'workout in progress',
  planned: 'workout planned',
  missed: 'workout missed',
  rest: 'rest day',
};

/** Mon–Sun strip (S08): today outlined, done days filled green, planned days ringed. */
export function WeekStrip({
  days,
  today,
  selected,
  onSelect,
}: {
  days: { date: string; state: DayState }[];
  today: string;
  selected: string | null;
  onSelect: (date: string) => void;
}) {
  const t = useTheme();
  const dot = t.spacing.xxxl;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }} accessibilityRole="tablist">
      {days.map(({ date, state }) => {
        const isToday = date === today;
        const isSel = date === selected;
        const filled = state === 'done';
        const ringed = state === 'planned' || state === 'active';
        return (
          <PressableScale
            key={date}
            feedback="selection"
            onPress={() => onSelect(date)}
            accessibilityRole="tab"
            accessibilityLabel={`${longWeekday(date)} ${dayOfMonth(date)}${isToday ? ', today' : ''}, ${SPOKEN[state]}`}
            accessibilityState={{ selected: isSel }}
            testID={`day-${date}`}
            style={{
              flex: 1,
              alignItems: 'center',
              gap: t.spacing.xxs,
              paddingVertical: t.spacing.xs,
              borderRadius: t.radius.card,
              backgroundColor: isSel ? t.colors.surface : 'transparent',
              minHeight: t.sizes.touch,
            }}
          >
            <Text variant="caption" color={isToday ? 'textPrimary' : 'textSecondary'}>
              {shortWeekday(date)}
            </Text>
            <View
              style={{
                width: dot,
                height: dot,
                borderRadius: t.radius.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: filled ? t.colors.accent : 'transparent',
                borderWidth: ringed || isToday ? 2 : 0,
                borderColor: ringed ? t.colors.accent : t.colors.inverse,
              }}
            >
              {filled ? (
                <Check color={t.colors.onAccent} size={t.sizes.iconSmall} strokeWidth={2.5} />
              ) : (
                <Text variant="callout" tabular color={state === 'missed' ? 'textTertiary' : 'textPrimary'}>
                  {dayOfMonth(date)}
                </Text>
              )}
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}
