import { Check } from 'lucide-react-native';
import { useEffect, useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import { haptics } from '@/services/haptics';
import { useTheme, type Theme } from '@/theme';

import { PressableScale } from './PressableScale';
import { Text } from './Text';

export type TickSize = 'default' | 'gym';
export type TickShape = 'circle' | 'square';

/** Visual mark, hit box and hitSlop per tick size (gym: 48 mark, 56 box, 64 effective). Pure. */
export function tickMetrics(size: TickSize, t: Pick<Theme, 'sizes' | 'spacing'>) {
  return size === 'gym'
    ? {
        mark: t.sizes.hitGym - t.spacing.xs,
        hit: t.sizes.hitGym,
        slop: (t.sizes.hitGymLarge - t.sizes.hitGym) / 2,
      }
    : { mark: t.spacing.xxl, hit: t.sizes.touch, slop: 0 };
}

export type TickMarkProps = {
  checked: boolean;
  size?: TickSize;
  shape?: TickShape;
  testID?: string;
};

/**
 * Visual-only tick (no press handling, hidden from screen readers). Use inside a row that is
 * itself the checkbox (MealsCard, OptionTile). Unchecked = borderStrong outline (≥ 3:1);
 * checked = accent fill + onAccent check with a springy pop.
 */
export function TickMark({ checked, size = 'default', shape = 'circle', testID }: TickMarkProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const { mark } = tickMetrics(size, t);
  const scale = useSharedValue(1);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduceMotion || !checked) return;
    scale.set(
      withSequence(
        withSpring(1.18, { ...t.motion.spring, stiffness: t.motion.spring.stiffness * 2 }),
        withSpring(1, t.motion.spring),
      ),
    );
  }, [checked, reduceMotion, scale, t.motion.spring]);

  const pop = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      testID={testID}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[
        {
          width: mark,
          height: mark,
          borderRadius: shape === 'circle' ? t.radius.pill : t.radius.button,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: checked ? t.colors.accent : 'transparent',
          borderWidth: checked ? 0 : t.sizes.borderThick,
          borderColor: t.colors.borderStrong,
        },
        pop,
      ]}
    >
      {checked ? (
        <Check
          color={t.colors.onAccent}
          size={size === 'gym' ? t.sizes.icon : t.sizes.iconMedium}
          strokeWidth={t.sizes.iconStrokeBold}
        />
      ) : null}
    </Animated.View>
  );
}

export type TickProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Spoken name, e.g. "Set 3 done" or "Breakfast eaten". Required. */
  accessibilityLabel: string;
  accessibilityHint?: string;
  /** 'default' = 48dp target; 'gym' = 56dp target with hitSlop to 64dp (set logging). */
  size?: TickSize;
  shape?: TickShape;
  /**
   * Haptic when it becomes checked (fires on commit). 'success' (default) for core actions
   * (set tick, meal eaten); 'light' for lists like groceries. Unticking always uses selection.
   */
  haptic?: 'success' | 'light';
  disabled?: boolean;
  testID?: string;
};

/** Big, springy, round checkbox (set check, meal tick). */
export function Tick({
  checked,
  onChange,
  accessibilityLabel,
  accessibilityHint,
  size = 'default',
  shape = 'circle',
  haptic = 'success',
  disabled,
  testID,
}: TickProps) {
  const t = useTheme();
  const { hit, slop } = tickMetrics(size, t);
  return (
    <PressableScale
      testID={testID}
      feedback="none"
      disabled={disabled}
      hitSlop={slop || undefined}
      onPress={() => {
        if (checked) haptics.selection();
        else haptics[haptic]();
        onChange(!checked);
      }}
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ checked, disabled: Boolean(disabled) }}
      style={{
        width: hit,
        height: hit,
        borderRadius: t.radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <TickMark checked={checked} size={size} shape={shape} />
    </PressableScale>
  );
}

export type CheckboxProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Visible + spoken label (grocery item, option). */
  label: string;
  /** Secondary line, e.g. "2 × 400 g". */
  description?: string;
  /** 'checkbox' (default) or 'radio' (one-of lists: plans, options). */
  role?: 'checkbox' | 'radio';
  /** Trailing content (price, quantity). */
  trailing?: ReactNode;
  /** Dim + strike the label when checked (shopping lists). */
  strikeWhenChecked?: boolean;
  disabled?: boolean;
  testID?: string;
};

/** Full-width row checkbox / radio: the whole row is the target (≥ 56dp tall). */
export function Checkbox({
  checked,
  onChange,
  label,
  description,
  role = 'checkbox',
  trailing,
  strikeWhenChecked = false,
  disabled,
  testID,
}: CheckboxProps) {
  const t = useTheme();
  const struck = strikeWhenChecked && checked;
  return (
    <PressableScale
      testID={testID}
      feedback="selection"
      disabled={disabled}
      onPress={() => {
        if (role === 'radio' && checked) return;
        onChange(!checked);
      }}
      accessibilityRole={role}
      accessibilityLabel={description ? `${label}, ${description}` : label}
      accessibilityState={
        role === 'radio'
          ? { selected: checked, checked, disabled: Boolean(disabled) }
          : { checked, disabled: Boolean(disabled) }
      }
      style={{
        minHeight: t.sizes.row,
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.sm,
        paddingVertical: t.spacing.xs,
        borderRadius: t.radius.button,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <TickMark checked={checked} shape={role === 'radio' ? 'circle' : 'square'} />
      <View style={{ flex: 1 }}>
        <Text
          variant="body"
          color={struck ? 'textSecondary' : 'textPrimary'}
          style={struck ? { textDecorationLine: 'line-through' } : undefined}
        >
          {label}
        </Text>
        {description ? (
          <Text variant="callout" color="textSecondary" tabular>
            {description}
          </Text>
        ) : null}
      </View>
      {trailing}
    </PressableScale>
  );
}
