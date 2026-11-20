import { Sparkles, X } from 'lucide-react-native';
import { memo } from 'react';
import { View, type AccessibilityActionEvent } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { Button, IconButton, PressableScale, Text } from '@/ui';
import { enterAt, exitFade, layoutSpring } from '@/ui/listMotion';

import type { ShownCard } from '../logic/cardState';

/**
 * Stacked action card (sheet 11): AI icon, title, one line, one trailing action, dismiss.
 * The body (icon + text) opens the detail sheet; dismiss and the action are SIBLINGS of the body,
 * not nested inside it, so VoiceOver / TalkBack reach each one. The body also exposes "apply" and
 * "dismiss" as accessibility actions for a one-swipe path.
 */
export const AssistantCard = memo(function AssistantCard({
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
  const actions = [
    ...(c.actionLabel ? [{ name: 'apply', label: c.actionLabel }] : []),
    { name: 'dismiss', label: 'Dismiss' },
  ];
  const onA11yAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'apply') onAction(card);
    else if (e.nativeEvent.actionName === 'dismiss') onDismiss(card);
  };
  return (
    <Animated.View
      entering={enterAt(index, reduceMotion)}
      exiting={exitFade(reduceMotion)}
      layout={layoutSpring(reduceMotion)}
    >
      <View
        testID={`card-${card.ruleId}-container`}
        style={{ backgroundColor: t.colors.surface, borderRadius: t.radius.card, padding: t.spacing.card }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.xs }}>
          <PressableScale
            testID={`card-${card.ruleId}`}
            onPress={() => onOpen(card)}
            accessibilityRole="button"
            accessibilityLabel={`${c.title}. ${c.body}`}
            accessibilityHint="Shows why and what you can do"
            accessibilityActions={actions}
            onAccessibilityAction={onA11yAction}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.sm, borderRadius: t.radius.button }}
          >
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
            <View style={{ flex: 1, minWidth: 0, paddingTop: t.spacing.xxs }}>
              <Text variant="headline">{c.title}</Text>
              <Text variant="callout" color="textSecondary">
                {c.body}
              </Text>
            </View>
          </PressableScale>
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
      </View>
    </Animated.View>
  );
});
