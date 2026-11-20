import { GlassWater, Plus } from 'lucide-react-native';
import { memo } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { PressableScale, Text } from '@/ui';

import { Glass } from './Glass';
import { GLASS_ML, formatWater, waterGlasses } from '../logic/water';

/**
 * Water, the same everywhere (Today and Eat): one GlassWater icon, accent progress dots, and a
 * visible "+250 ml" button (no hidden long-press). The left part opens the water screen when
 * `onOpen` is given; the add button is its sibling so screen readers reach both.
 */
export const WaterCard = memo(function WaterCard({
  totalMl,
  goalMl,
  onAdd,
  onOpen,
  testID = 'water-card',
}: {
  totalMl: number;
  goalMl: number;
  onAdd: () => void;
  onOpen?: () => void;
  testID?: string;
}) {
  const t = useTheme();
  const g = waterGlasses(totalMl, goalMl);
  const summary = (
    <>
      <GlassWater color={t.colors.textPrimary} size={t.sizes.icon} strokeWidth={t.sizes.iconStroke} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="headline">Water</Text>
        <Text variant="callout" color="textSecondary" tabular numberOfLines={1} testID="water-total">
          {formatWater(totalMl)} of {formatWater(g.goalMl)}
        </Text>
      </View>
    </>
  );
  const rowStyle = {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: t.spacing.sm,
    minHeight: t.sizes.touch,
  };
  return (
    <View
      testID={testID}
      style={{ backgroundColor: t.colors.surface, borderRadius: t.radius.card, padding: t.spacing.card }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
        {onOpen ? (
          <PressableScale
            testID="open-water"
            onPress={onOpen}
            accessibilityRole="button"
            accessibilityLabel={`Water: ${formatWater(totalMl)} of ${formatWater(g.goalMl)}`}
            accessibilityHint="Opens your water log"
            style={[rowStyle, { borderRadius: t.radius.button }]}
          >
            {summary}
          </PressableScale>
        ) : (
          <View style={rowStyle}>{summary}</View>
        )}
        <PressableScale
          testID="add-water"
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel={`Add ${GLASS_ML} millilitres of water`}
          style={{
            minHeight: t.sizes.touch,
            paddingHorizontal: t.spacing.md,
            borderRadius: t.radius.pill,
            borderWidth: t.sizes.hairline,
            borderColor: t.colors.borderStrong,
            backgroundColor: t.colors.bg,
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.xxs,
          }}
        >
          <Plus color={t.colors.textPrimary} size={t.sizes.iconSmall} strokeWidth={t.sizes.iconStrokeBold} />
          <Text variant="callout" tabular>
            {GLASS_ML} ml
          </Text>
        </PressableScale>
      </View>
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs, marginTop: t.spacing.md }}
      >
        {Array.from({ length: g.goal }, (_, i) => (
          <Glass key={i} index={i} full={i < g.filled} />
        ))}
      </View>
    </View>
  );
});
