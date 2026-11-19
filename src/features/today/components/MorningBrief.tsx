import { CircleCheck, Dumbbell, Moon, Utensils, type LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { useTheme, type ColorToken } from '@/theme';
import { Card, Text } from '@/ui';

import type { BriefRow } from '../logic/brief';

import { enterAt } from './motion';

const ICON: Record<BriefRow['kind'], { icon: LucideIcon; color: ColorToken }> = {
  workout: { icon: Dumbbell, color: 'textPrimary' },
  rest: { icon: Moon, color: 'textPrimary' },
  meal: { icon: Utensils, color: 'textPrimary' },
  done: { icon: CircleCheck, color: 'accentText' },
};

/**
 * W2 "Today in one glance": an Uber-style trip card. Each stop (workout, next meal) sits on a
 * thin vertical line, like the pickup → drop-off of a ride.
 */
export function MorningBrief({
  rows,
  index = 0,
  testID = 'today-brief',
}: {
  rows: BriefRow[];
  index?: number;
  testID?: string;
}) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  if (rows.length === 0) return null;
  const dot = t.sizes.touch - t.spacing.xs;
  return (
    <Animated.View entering={enterAt(index, reduceMotion)}>
      <Card testID={testID}>
        <Text variant="caption" color="textSecondary" style={{ marginBottom: t.spacing.sm }}>
          YOUR DAY
        </Text>
        {rows.map((row, i) => {
          const { icon: Icon, color } = ICON[row.kind];
          const last = i === rows.length - 1;
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
                    backgroundColor: row.kind === 'done' ? t.colors.accentSoft : t.colors.bg,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon color={t.colors[color]} size={t.sizes.icon} strokeWidth={t.sizes.iconStroke} />
                </View>
                {last ? null : (
                  <View
                    style={{
                      flex: 1,
                      minHeight: t.spacing.sm,
                      width: t.sizes.hairline * 2,
                      backgroundColor: t.colors.border,
                    }}
                  />
                )}
              </View>
              <View
                style={{
                  flex: 1,
                  paddingTop: t.spacing.xxs,
                  paddingBottom: last ? 0 : t.spacing.md,
                }}
              >
                <Text variant="headline" numberOfLines={2}>
                  {row.title}
                </Text>
                <Text variant="callout" color="textSecondary" tabular>
                  {row.meta}
                </Text>
              </View>
            </View>
          );
        })}
      </Card>
    </Animated.View>
  );
}
