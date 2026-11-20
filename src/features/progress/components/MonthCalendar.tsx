import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { IconButton, Text } from '@/ui';
import { useTheme } from '@/theme';

import { monthName, type MonthKey } from '../logic/dates';
import type { CalendarDay } from '../logic/streak';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Month grid: filled accent dot = workout done, small dot = food logged, ring = today. */
export function MonthCalendar({
  month,
  rows,
  onPrev,
  onNext,
  canNext,
  locked,
  testID = 'progress-calendar',
}: {
  month: MonthKey;
  rows: (CalendarDay | null)[][];
  onPrev: () => void;
  onNext: () => void;
  canNext: boolean;
  /** Shown instead of the grid for a month the user can't open (free plan). */
  locked?: ReactNode;
  testID?: string;
}) {
  const t = useTheme();
  const title = `${monthName(month.month)} ${month.year}`;
  return (
    <View testID={testID} style={{ gap: t.spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="headline" accessibilityRole="header">
          {title}
        </Text>
        <View style={{ flexDirection: 'row' }}>
          <IconButton
            icon={ChevronLeft}
            accessibilityLabel="Previous month"
            onPress={onPrev}
            testID={`${testID}-prev`}
          />
          <IconButton
            icon={ChevronRight}
            accessibilityLabel="Next month"
            onPress={onNext}
            disabled={!canNext}
            color={canNext ? 'textPrimary' : 'textTertiary'}
            testID={`${testID}-next`}
          />
        </View>
      </View>
      <View style={{ flexDirection: 'row' }} importantForAccessibility="no-hide-descendants">
        {WEEKDAYS.map((d, i) => (
          <Text key={i} variant="caption" color="textTertiary" align="center" style={{ flex: 1 }}>
            {d}
          </Text>
        ))}
      </View>
      {locked ? (
        <Animated.View key={`${title}-locked`} entering={FadeIn.duration(t.motion.duration.base)}>
          {locked}
        </Animated.View>
      ) : (
        <Animated.View
          key={title}
          entering={FadeIn.duration(t.motion.duration.base)}
          style={{ gap: t.spacing.xxs }}
        >
          {rows.map((row, ri) => (
            <View key={ri} style={{ flexDirection: 'row' }}>
              {row.map((cell, ci) => (
                <View
                  key={ci}
                  style={{ flex: 1, alignItems: 'center', paddingVertical: t.spacing.xxs }}
                >
                  {cell ? <DayCell day={cell} /> : null}
                </View>
              ))}
            </View>
          ))}
        </Animated.View>
      )}
    </View>
  );
}

function DayCell({ day }: { day: CalendarDay }) {
  const t = useTheme();
  // 7 columns fit a 360 dp screen at 130% text.
  const size = t.sizes.touch - t.spacing.sm;
  const parts = [
    day.workout ? 'workout done' : null,
    day.logged ? 'food logged' : null,
    day.isToday ? 'today' : null,
  ].filter(Boolean);
  return (
    <View
      accessible
      accessibilityLabel={`${day.day}${parts.length ? `, ${parts.join(', ')}` : ''}`}
      testID={`cal-${day.date}`}
      style={{ alignItems: 'center', gap: t.sizes.borderThick }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: t.radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: day.workout ? t.colors.accent : 'transparent',
          borderWidth: day.isToday ? t.sizes.borderThick : 0,
          borderColor: t.colors.textPrimary,
        }}
      >
        <Text
          variant="callout"
          tabular
          color={day.workout ? 'onAccent' : day.isFuture ? 'textTertiary' : 'textPrimary'}
          maxFontSizeMultiplier={1.2}
        >
          {day.day}
        </Text>
      </View>
      <View
        style={{
          width: t.spacing.xxs,
          height: t.spacing.xxs,
          borderRadius: t.radius.pill,
          backgroundColor: day.logged ? t.colors.textSecondary : 'transparent',
        }}
      />
    </View>
  );
}
