import { Sparkles, X } from 'lucide-react-native';
import { View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { enterAt, exitFade, layoutSpring } from '@/features/today/components/motion';
import { useTheme } from '@/theme';
import { Button, Card, IconButton, Text } from '@/ui';

import type { ShownCard } from '../logic/cardState';

/** Stacked action card (sheet 11): icon, title, one line, one trailing action, dismiss. */
export function AssistantCard({
  card,
  index,
  onOpen,
  onAction,
  onDismiss,
}: {
  card: ShownCard;
  index: number;
  onOpen: (card: ShownCard) => void;
  onAction: (card: ShownCard) => void;
  onDismiss: (card: ShownCard) => void;
}) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const c = card.candidate;
  return (
    <Animated.View
      entering={enterAt(index, reduceMotion)}
      exiting={exitFade(reduceMotion)}
      layout={layoutSpring(reduceMotion)}
    >
      <Card
        onPress={() => onOpen(card)}
        accessibilityLabel={`${c.title}. ${c.body}`}
        accessibilityHint="Shows why and what you can do"
        testID={`card-${card.ruleId}`}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.sm }}>
          <View
            style={{
              width: t.sizes.touch - t.spacing.xs,
              height: t.sizes.touch - t.spacing.xs,
              borderRadius: t.radius.pill,
              backgroundColor: t.colors.accentSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Sparkles color={t.colors.accentText} size={t.sizes.icon} strokeWidth={t.sizes.iconStroke} />
          </View>
          <View style={{ flex: 1, paddingTop: t.spacing.xxs }}>
            <Text variant="headline">{c.title}</Text>
            <Text variant="callout" color="textSecondary">
              {c.body}
            </Text>
          </View>
          <IconButton
            icon={X}
            accessibilityLabel={`Dismiss ${c.title}`}
            color="textSecondary"
            onPress={() => onDismiss(card)}
            testID={`card-${card.ruleId}-dismiss`}
          />
        </View>
        {c.actionLabel ? (
          <Button
            label={c.actionLabel}
            variant="secondary"
            onPress={() => onAction(card)}
            style={{ marginTop: t.spacing.sm }}
            testID={`card-${card.ruleId}-action`}
          />
        ) : null}
      </Card>
    </Animated.View>
  );
}
