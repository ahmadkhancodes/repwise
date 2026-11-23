import { Circle, CircleCheck, Dumbbell, Moon } from 'lucide-react-native';
import { View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { Card, Text } from '@/ui';
import { enterAt } from '@/ui/listMotion';

import type { EveningItem, TomorrowPreview } from '../logic/brief';

/** Evening: today's progress and a preview of tomorrow (core loop step 5). */
export function EveningCard({
  headline,
  items,
  tomorrow,
  index = 0,
}: {
  headline: string;
  items: EveningItem[];
  tomorrow: TomorrowPreview | null;
  index?: number;
}) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const icon = { size: t.sizes.icon, strokeWidth: t.sizes.iconStroke };
  return (
    <Animated.View entering={enterAt(index, reduceMotion)}>
      <Card testID="today-evening">
        <Text variant="eyebrow" color="textSecondary">
          Tonight
        </Text>
        <Text variant="title2" style={{ marginTop: t.spacing.xxs }} testID="evening-headline">
          {headline}
        </Text>
        <View style={{ gap: t.spacing.xs, marginTop: t.spacing.sm }}>
          {items.map((i) => (
            <View
              key={i.id}
              testID={`evening-${i.id}`}
              accessible
              accessibilityLabel={`${i.label}${i.done ? ', done' : ''}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}
            >
              {i.done ? (
                <CircleCheck color={t.colors.accentText} {...icon} />
              ) : (
                <Circle color={t.colors.borderStrong} {...icon} />
              )}
              <Text variant="body" tabular>
                {i.label}
              </Text>
            </View>
          ))}
        </View>
        {tomorrow ? (
          <View
            testID="today-tomorrow"
            style={{
              marginTop: t.spacing.md,
              paddingTop: t.spacing.md,
              borderTopWidth: t.sizes.hairline,
              borderTopColor: t.colors.border,
              flexDirection: 'row',
              gap: t.spacing.sm,
              alignItems: 'center',
            }}
          >
            {tomorrow.restDay ? (
              <Moon color={t.colors.textSecondary} {...icon} />
            ) : (
              <Dumbbell color={t.colors.textSecondary} {...icon} />
            )}
            <View style={{ flex: 1 }}>
              <Text variant="eyebrow" color="textSecondary">
                Tomorrow
              </Text>
              <Text variant="headline">{tomorrow.title}</Text>
              <Text variant="callout" color="textSecondary" tabular>
                {tomorrow.meta}
              </Text>
            </View>
          </View>
        ) : null}
      </Card>
    </Animated.View>
  );
}
