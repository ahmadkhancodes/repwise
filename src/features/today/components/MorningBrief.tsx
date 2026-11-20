import { Check, Dumbbell, Moon, Utensils, type LucideIcon } from 'lucide-react-native';
import { memo } from 'react';
import { View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { Text } from '@/ui';
import { enterAt } from '@/ui/listMotion';

import type { BriefRow } from '../logic/brief';

const ICON: Record<BriefRow['kind'], LucideIcon> = {
  workout: Dumbbell,
  rest: Moon,
  meal: Utensils,
  done: Check,
};

/**
 * W2 "Today in one glance": a premium Uber-style trip card on the inverse surface (black in
 * light, white in dark). The date is the eyebrow; each stop (workout, next meal) sits on a thin
 * route line like pickup → drop-off. Calm, glanceable from a metre, and compact so the primary
 * action below it stays above the fold on a 360×640 screen.
 */
export const MorningBrief = memo(function MorningBrief({
  rows,
  dateLabel,
  index = 0,
  testID = 'today-brief',
}: {
  rows: BriefRow[];
  /** "Thursday 19 November" (shown as the eyebrow). */
  dateLabel: string;
  index?: number;
  testID?: string;
}) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  if (rows.length === 0) return null;
  const dot = t.sizes.touch - t.spacing.xs;
  return (
    <Animated.View entering={enterAt(index, reduceMotion)}>
      <View
        testID={testID}
        style={{ backgroundColor: t.colors.inverse, borderRadius: t.radius.card, padding: t.spacing.card }}
      >
        <Text
          variant="caption"
          color="onInverse"
          testID="today-date"
          style={{ textTransform: 'uppercase', opacity: 0.72, marginBottom: t.spacing.sm }}
        >
          {dateLabel}
        </Text>
        {rows.map((row, i) => {
          const Icon = ICON[row.kind];
          const last = i === rows.length - 1;
          const done = row.kind === 'done';
          return (
            <View
              key={`${row.kind}-${i}`}
              testID={`${testID}-row-${i}`}
              accessible
              accessibilityLabel={`${row.title}, ${row.meta}`}
              style={{ flexDirection: 'row', gap: t.spacing.sm }}
            >
              <View style={{ width: dot, alignItems: 'center' }}>
                <View
                  style={{
                    width: dot,
                    height: dot,
                    borderRadius: t.radius.pill,
                    backgroundColor: done ? t.colors.accentOnInverse : 'transparent',
                    borderWidth: done ? 0 : t.sizes.borderThick,
                    borderColor: t.colors.onInverse,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon
                    color={done ? t.colors.inverse : t.colors.onInverse}
                    size={t.sizes.iconMedium}
                    strokeWidth={done ? t.sizes.iconStrokeBold : t.sizes.iconStroke}
                  />
                </View>
                {last ? null : (
                  <View
                    style={{
                      flex: 1,
                      minHeight: t.spacing.sm,
                      width: t.sizes.borderThick,
                      marginVertical: t.spacing.xxs,
                      borderRadius: t.radius.pill,
                      backgroundColor: t.colors.onInverse,
                      opacity: 0.32,
                    }}
                  />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0, paddingTop: t.spacing.xxs, paddingBottom: last ? 0 : t.spacing.sm }}>
                <Text variant="headline" color="onInverse" numberOfLines={2}>
                  {row.title}
                </Text>
                <Text variant="callout" color="onInverse" tabular numberOfLines={1} style={{ opacity: 0.72 }}>
                  {row.meta}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
});
