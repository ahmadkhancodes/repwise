import { memo } from 'react';
import { View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { Card, ProgressRing, Sparkline, Text } from '@/ui';
import { enterAt } from '@/ui/listMotion';

import type { StatTile } from '../logic/stats';

/** A thin progress bar under a tile's number (track on surface2, accent fill). */
function Bar({ progress }: { progress: number }) {
  const t = useTheme();
  return (
    <View
      style={{
        height: t.spacing.xxs,
        borderRadius: t.radius.pill,
        backgroundColor: t.colors.surface2,
        overflow: 'hidden',
        marginTop: t.spacing.xs,
      }}
    >
      <View
        style={{
          width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`,
          height: '100%',
          borderRadius: t.radius.pill,
          backgroundColor: t.colors.accent,
        }}
      />
    </View>
  );
}

function Tile({ tile, onPress, spark }: { tile: StatTile; onPress?: () => void; spark?: readonly number[] }) {
  const t = useTheme();
  const card = (
    <Card
      testID={tile.action ? `stat-${tile.id}-enable` : `stat-${tile.id}`}
      onPress={onPress}
      accessibilityLabel={tile.a11y}
      style={{ flexGrow: 1, minHeight: t.sizes.hitGymLarge + t.spacing.xxl, justifyContent: 'space-between' }}
    >
      <Text variant="eyebrow" color="textSecondary" numberOfLines={1}>
        {tile.label}
      </Text>
      <View style={{ marginTop: t.spacing.xs }}>
        <Text
          variant={tile.action ? 'headline' : 'title2'}
          color={tile.action ? 'accentText' : 'textPrimary'}
          tabular
          numberOfLines={tile.action ? 2 : 1}
          testID={`stat-${tile.id}-value`}
        >
          {tile.value}
        </Text>
        <Text variant="caption" color="textSecondary" tabular numberOfLines={2} testID={`stat-${tile.id}-detail`}>
          {tile.detail}
        </Text>
        {tile.progress != null ? <Bar progress={tile.progress} /> : null}
        {spark && spark.length >= 2 ? (
          <View style={{ marginTop: t.spacing.xs }}>
            <Sparkline values={spark} height={t.spacing.xxl} testID="stat-weight-spark" />
          </View>
        ) : null}
      </View>
    </Card>
  );
  // Half the row (two columns); at large font scales a tile grows and the row wraps.
  const cell = { flexGrow: 1, flexBasis: '40%' as const };
  // A read-only tile is still spoken as one sentence (a pressable Card labels itself).
  return onPress ? (
    <View style={cell}>{card}</View>
  ) : (
    <View style={cell} accessible accessibilityLabel={tile.a11y}>
      {card}
    </View>
  );
}

/** Calories: the one ring, full width (eaten vs target, kcal left). */
function CaloriesTile({ tile, onPress }: { tile: StatTile; onPress?: () => void }) {
  const t = useTheme();
  return (
    <Card testID="stat-calories" onPress={onPress} accessibilityLabel={tile.a11y}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
        <ProgressRing
          progress={tile.progress ?? 0}
          size={t.sizes.hitGymLarge + t.spacing.md}
          strokeWidth={t.sizes.ringStrokeThin + t.spacing.xxs}
          accessibilityLabel={tile.a11y}
          testID="stat-calories-ring"
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="eyebrow" color="textSecondary" numberOfLines={1}>
            {tile.label}
          </Text>
          <Text variant="title2" tabular numberOfLines={1} testID="stat-calories-value">
            {tile.value}
          </Text>
          <Text variant="callout" color="textSecondary" tabular numberOfLines={1} testID="stat-calories-detail">
            {tile.detail}
          </Text>
        </View>
      </View>
    </Card>
  );
}

export type StatsGridProps = {
  tiles: StatTile[];
  weightValues: readonly number[];
  onOpenEat: () => void;
  onOpenProgress: () => void;
  onLogWeight: () => void;
  onEnableSteps: () => void;
  index?: number;
};

/**
 * Home dashboard stats (owner 22 Nov): calm, glanceable tiles under the workout hero. The gym
 * comes first (the hero); the numbers sit "around the corner": calories ring, then a 2-column
 * grid that reflows to one column at large font scales. Tabular numbers, tokens only.
 */
export const StatsGrid = memo(function StatsGrid({
  tiles,
  weightValues,
  onOpenEat,
  onOpenProgress,
  onLogWeight,
  onEnableSteps,
  index = 2,
}: StatsGridProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const [calories, ...rest] = tiles;
  const handler = (tile: StatTile): (() => void) | undefined => {
    switch (tile.id) {
      case 'calories':
      case 'protein':
        return onOpenEat;
      case 'steps':
        return tile.action ? onEnableSteps : undefined;
      case 'weight':
        return tile.action ? onLogWeight : onOpenProgress;
      default:
        return onOpenProgress;
    }
  };
  return (
    <Animated.View entering={enterAt(index, reduceMotion)}>
      <View testID="today-stats" style={{ gap: t.spacing.sm }}>
        {calories ? <CaloriesTile tile={calories} onPress={handler(calories)} /> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
          {rest.map((tile) => (
            <Tile
              key={tile.id}
              tile={tile}
              onPress={handler(tile)}
              spark={tile.id === 'weight' ? weightValues : undefined}
            />
          ))}
        </View>
      </View>
    </Animated.View>
  );
});
