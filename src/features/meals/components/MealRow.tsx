import { memo } from 'react';
import { View } from 'react-native';

import type { MealStatus } from '@/db/schema';
import { useTheme } from '@/theme';
import { Badge, IconButton, PressableScale, SwapIcon, Text, Tick } from '@/ui';

import type { RecipeArt as Art } from '../logic/art';
import { MacroChips } from './MacroChips';
import { RecipeArt } from './RecipeArt';

/** What one meal row shows. Today and Eat both map their own views onto this. */
export type MealRowModel = {
  id: string;
  slot: string;
  title: string;
  status: MealStatus;
  /** Caption above the dish: "Lunch · 13:00 · 1.5 servings". */
  meta: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Recipe art; compact rows (Today) leave it out. */
  art?: Art;
};

export type MealRowProps = {
  meal: MealRowModel;
  /** Today's timeline: no art, no surface (it sits inside the Meals card). */
  compact?: boolean;
  /** The next meal to eat (gets a "Next" badge). */
  next?: boolean;
  /** Past days for free users: read-only (no tick, no swap). */
  locked?: boolean;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
  onSwap: (id: string) => void;
  /** testID prefix: "today-" on Today → today-meal-lunch, today-tick-lunch, today-swap-lunch. */
  idPrefix?: string;
};

/**
 * THE meal row (UI audit N2: one tap model on every tab).
 *  - Leading tick = "I ate it" (core action, success haptic; unticking is selection).
 *  - Body = open the recipe. Long-press the body = swap (W4).
 *  - Trailing swap icon for planned meals.
 * Eaten: greyed with the filled tick, no strike. Skipped: greyed with a "Skipped" badge.
 * Tick, body and swap are siblings so VoiceOver / TalkBack reach each one.
 */
export const MealRow = memo(function MealRow({
  meal,
  compact = false,
  next = false,
  locked = false,
  onOpen,
  onToggle,
  onSwap,
  idPrefix = '',
}: MealRowProps) {
  const t = useTheme();
  const eaten = meal.status === 'eaten';
  const skipped = meal.status === 'skipped';
  const done = eaten || skipped;
  const id = (part: string) => `${idPrefix}${part}-${meal.slot}`;
  const state = eaten ? ', eaten' : skipped ? ', skipped' : '';

  return (
    <View
      testID={id('meal-tile')}
      style={[
        { flexDirection: 'row', alignItems: 'center', minHeight: t.sizes.row },
        compact
          ? null
          : {
              backgroundColor: t.colors.surface,
              borderRadius: t.radius.card,
              paddingLeft: t.spacing.xxs,
              paddingRight: t.spacing.xxs,
            },
      ]}
    >
      {locked ? null : (
        <Tick
          checked={eaten}
          onChange={() => onToggle(meal.id)}
          accessibilityLabel={`${meal.title} eaten`}
          accessibilityHint={eaten ? 'Marks it as not eaten' : 'Logs it as eaten'}
          testID={id('tick')}
        />
      )}
      <PressableScale
        testID={id('meal')}
        onPress={() => onOpen(meal.id)}
        onLongPress={locked || done ? undefined : () => onSwap(meal.id)}
        accessibilityRole="button"
        accessibilityLabel={`${meal.meta}: ${meal.title}, ${Math.round(meal.kcal)} calories${state}`}
        accessibilityHint={
          locked || done ? 'Opens the recipe' : 'Opens the recipe. Long-press to swap.'
        }
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm,
          minHeight: t.sizes.row,
          paddingVertical: compact ? t.spacing.xs : t.spacing.card,
          paddingLeft: locked ? (compact ? 0 : t.spacing.card - t.spacing.xxs) : t.spacing.xxs,
          paddingRight: t.spacing.xxs,
          borderRadius: t.radius.button,
        }}
      >
        {!compact && meal.art ? (
          <RecipeArt
            art={meal.art}
            testID={id('meal-art')}
            style={done ? { opacity: 0.55 } : undefined}
          />
        ) : null}
        <View style={{ flex: 1, minWidth: 0, gap: t.spacing.xxs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}>
            <Text
              variant="caption"
              color="textSecondary"
              tabular
              numberOfLines={1}
              style={{ flexShrink: 1 }}
            >
              {meal.meta}
            </Text>
            {next && !done ? <Badge label="Next" tone="accent" testID={`${idPrefix}next-meal`} /> : null}
          </View>
          <Text variant="headline" color={done ? 'textSecondary' : 'textPrimary'} numberOfLines={2}>
            {meal.title}
          </Text>
          {skipped ? (
            <Badge label="Skipped" testID={id('meal-skipped')} />
          ) : (
            <MacroChips kcal={meal.kcal} protein={meal.protein} carbs={meal.carbs} fat={meal.fat} />
          )}
        </View>
      </PressableScale>
      {locked || done ? null : (
        <IconButton
          icon={SwapIcon}
          accessibilityLabel={`Swap ${meal.title}`}
          onPress={() => onSwap(meal.id)}
          color="textSecondary"
          testID={id('swap')}
        />
      )}
    </View>
  );
});
