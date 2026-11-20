import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { haptics } from '@/services/haptics';
import { useTheme } from '@/theme';

import { Text } from './Text';

export type SegmentOption<T extends string> = { value: T; label: string };

export type SegmentedProps<T extends string> = {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Spoken name of the whole control, e.g. "View". */
  accessibilityLabel: string;
  testID?: string;
};


/** Day / Week style toggle with a spring-animated thumb. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  testID,
}: SegmentedProps<T>) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const inset = t.spacing.xxs;
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const segment = options.length > 0 ? (width - inset * 2) / options.length : 0;
  const x = useSharedValue(index * segment);

  useEffect(() => {
    const target = index * segment;
    x.set(reduceMotion ? target : withSpring(target, t.motion.spring));
  }, [index, segment, reduceMotion, t.motion.spring, x]);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{
        flexDirection: 'row',
        backgroundColor: t.colors.surface2,
        borderRadius: t.radius.button,
        padding: inset,
        minHeight: t.sizes.touch,
      }}
    >
      {segment > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: inset,
              bottom: inset,
              left: inset,
              width: segment,
              borderRadius: t.radius.button - inset / 2,
              backgroundColor: t.colors.bg,
            },
            thumbStyle,
          ]}
        />
      ) : null}
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={testID ? `${testID}-${o.value}` : undefined}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected }}
            onPress={() => {
              if (selected) return;
              haptics.selection();
              onChange(o.value);
            }}
            style={{
              flex: 1,
              minHeight: t.sizes.touch - inset * 2,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: t.spacing.xs,
            }}
          >
            <Text
              variant="callout"
              color={selected ? 'textPrimary' : 'textSecondary'}
              align="center"
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
