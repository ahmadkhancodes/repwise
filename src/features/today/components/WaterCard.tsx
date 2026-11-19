import { GlassWater, Plus } from 'lucide-react-native';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { GLASS_ML } from '@/features/nutrition/logic/water';
import { useTheme } from '@/theme';
import { Card, PressableScale, Text } from '@/ui';

import { waterGlasses } from '../logic/water';

import { enterAt } from './motion';

/** One glass dot that springs up from empty when it fills. */
function Glass({ filled, index }: { filled: boolean; index: number }) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const fill = useSharedValue(filled ? 1 : 0);
  useEffect(() => {
    const v = filled ? 1 : 0;
    fill.set(reduceMotion ? v : withSpring(v, t.motion.spring));
  }, [filled, fill, reduceMotion, t.motion.spring]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: fill.value }], opacity: fill.value }));
  const size = t.spacing.lg;
  return (
    <View
      testID={`glass-${index}`}
      style={{
        width: size,
        height: size,
        borderRadius: t.radius.pill,
        backgroundColor: t.colors.surface2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Animated.View
        style={[{ width: size, height: size, borderRadius: t.radius.pill, backgroundColor: t.colors.accent }, style]}
      />
    </View>
  );
}

/** Water quick-add: one tap adds a 250 ml glass. */
export function WaterCard({
  totalMl,
  goalMl,
  onAdd,
  index = 4,
}: {
  totalMl: number;
  /** The user's goal from Water settings (nutrition `getWaterGoal`). */
  goalMl?: number;
  onAdd: () => void;
  index?: number;
}) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const g = waterGlasses(totalMl, goalMl);
  return (
    <Animated.View entering={enterAt(index, reduceMotion)}>
      <Card testID="today-water">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
          <GlassWater color={t.colors.textPrimary} size={t.sizes.icon} strokeWidth={t.sizes.iconStroke} />
          <View style={{ flex: 1 }}>
            <Text variant="headline">Water</Text>
            <Text variant="callout" color="textSecondary" tabular testID="water-total">
              {totalMl.toLocaleString('en-US')} / {g.goalMl.toLocaleString('en-US')} ml
            </Text>
          </View>
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
              borderColor: t.colors.border,
              backgroundColor: t.colors.bg,
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.xxs,
            }}
          >
            <Plus color={t.colors.textPrimary} size={t.sizes.iconSmall} strokeWidth={t.sizes.iconStroke} />
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
            <Glass key={i} index={i} filled={i < g.filled} />
          ))}
        </View>
      </Card>
    </Animated.View>
  );
}
