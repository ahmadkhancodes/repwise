import { Ban, CircleAlert } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { useTheme } from '@/theme';

import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { SwapIcon } from './icons';
import { enterAt } from './listMotion';
import { PressableScale } from './PressableScale';
import { Sheet } from './Sheet';
import { SkeletonCard, SkeletonGroup } from './Skeleton';
import { Text } from './Text';

/** One alternative in the swap sheet. */
export type SwapChoice = {
  key: string;
  title: string;
  /** One quiet line under the title: "Pakistani · 25 min", "Chest · Dumbbell". */
  subtitle?: string;
  /** Thumbnail: recipe art or the exercise muscle-map thumb (56dp). */
  media?: ReactNode;
  /** Extra line, e.g. macro chips. */
  detail?: ReactNode;
  accessibilityLabel: string;
};

export type SwapChooserProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** "Instead of Chicken karahi · 640 kcal · 48 g protein". */
  intro?: string;
  state: 'loading' | 'error' | 'ready';
  choices: readonly SwapChoice[];
  onPick: (key: string) => void;
  empty: { title: string; body: string };
  onRetry?: () => void;
  /** "Never show / suggest X": teaches the planner; tertiary, under the choices. */
  never?: { label: string; onPress: () => void };
  testID?: string;
};

/**
 * THE swap sheet (W4 "swap anything", UI audit N3): meals and exercises use the same shape —
 * intro line, up to three thumb + title + detail rows (one tap swaps), skeleton while the engine
 * looks, retry on error, and a "Never …" tertiary action. Feature sheets only map their data.
 */
export function SwapChooser({
  open,
  onClose,
  title,
  intro,
  state,
  choices,
  onPick,
  empty,
  onRetry,
  never,
  testID = 'swap-sheet',
}: SwapChooserProps) {
  const t = useTheme();
  const reduce = useReducedMotion();
  return (
    <Sheet open={open} onClose={onClose} title={title} testID={testID}>
      {intro ? (
        <Text variant="callout" color="textSecondary">
          {intro}
        </Text>
      ) : null}
      {state === 'error' ? (
        <EmptyState
          icon={CircleAlert}
          title="Couldn’t load swaps"
          body="Something went wrong on this phone. Try again."
          actionLabel={onRetry ? 'Try again' : undefined}
          onAction={onRetry}
          testID="swap-error"
        />
      ) : state === 'loading' ? (
        <SkeletonGroup label="Finding swaps" testID="swap-loading" style={{ gap: t.spacing.sm }}>
          <SkeletonCard media lines={2} />
          <SkeletonCard media lines={2} />
          <SkeletonCard media lines={2} />
        </SkeletonGroup>
      ) : choices.length === 0 ? (
        <EmptyState icon={SwapIcon} title={empty.title} body={empty.body} testID="swap-empty" />
      ) : (
        <View style={{ gap: t.spacing.sm }}>
          {choices.map((c, i) => (
            <Animated.View key={c.key} entering={enterAt(i, reduce)}>
              <PressableScale
                testID={`swap-option-${i}`}
                onPress={() => onPick(c.key)}
                accessibilityRole="button"
                accessibilityLabel={c.accessibilityLabel}
                style={{
                  backgroundColor: t.colors.surface,
                  borderRadius: t.radius.card,
                  padding: t.spacing.card,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: t.spacing.sm,
                }}
              >
                {c.media}
                <View style={{ flex: 1, minWidth: 0, gap: t.spacing.xxs }}>
                  <Text variant="headline" numberOfLines={2}>
                    {c.title}
                  </Text>
                  {c.subtitle ? (
                    <Text variant="caption" color="textSecondary" numberOfLines={1}>
                      {c.subtitle}
                    </Text>
                  ) : null}
                  {c.detail}
                </View>
                <SwapIcon
                  color={t.colors.textTertiary}
                  size={t.sizes.iconMedium}
                  strokeWidth={t.sizes.iconStroke}
                />
              </PressableScale>
            </Animated.View>
          ))}
        </View>
      )}
      {never ? (
        <Button
          label={never.label}
          variant="tertiary"
          icon={Ban}
          onPress={never.onPress}
          testID="swap-never"
        />
      ) : null}
    </Sheet>
  );
}
