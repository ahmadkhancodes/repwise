import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Button, Sheet, Text } from '@/ui';

import type { ShownCard } from '../logic/cardState';

/** S12 assistant card detail: the explanation and one action (Apply / Later / Dismiss). */
export function CardDetailSheet({
  card,
  onClose,
  onApply,
  onSnooze,
  onDismiss,
}: {
  card: ShownCard | null;
  onClose: () => void;
  onApply: (card: ShownCard) => void;
  onSnooze: (card: ShownCard) => void;
  onDismiss: (card: ShownCard) => void;
}) {
  const t = useTheme();
  const c = card?.candidate;
  return (
    <Sheet open={card !== null} onClose={onClose} title={c?.title} testID="card-detail">
      {card && c ? (
        <View style={{ gap: t.spacing.md }}>
          <Text variant="body" color="textSecondary" testID="card-detail-text">
            {c.detail}
          </Text>
          <View style={{ gap: t.spacing.xs }}>
            {c.actionLabel ? (
              <Button label={c.actionLabel} onPress={() => onApply(card)} testID="card-detail-apply" />
            ) : null}
            <Button
              label="Later"
              variant="secondary"
              onPress={() => onSnooze(card)}
              accessibilityHint="Hides this card for 3 hours"
              testID="card-detail-later"
            />
            <Button label="Dismiss" variant="tertiary" onPress={() => onDismiss(card)} testID="card-detail-dismiss" />
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}
