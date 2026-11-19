import { useEffect, useRef } from 'react';
import {
  Platform,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  interpolate,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { haptics } from '@/services/haptics';
import { useTheme } from '@/theme';

import { Text } from './Text';

export type WheelItem<T> = { value: T; label: string };

export type WheelPickerProps<T> = {
  items: readonly WheelItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Spoken name, e.g. "Reps". */
  accessibilityLabel: string;
  /** Odd number of visible rows (default 5). */
  visibleRows?: number;
  testID?: string;
};

/** Index of the row centred at scroll offset y, clamped to the list. Pure. */
export function indexAtOffset(y: number, rowHeight: number, count: number): number {
  'worklet';
  if (count <= 0 || rowHeight <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(y / rowHeight)));
}

/** Row height grows with the OS font scale so 130%+ text never clips. Pure. */
export function wheelRowHeight(base: number, fontScale: number): number {
  return Math.round(base * Math.min(2, Math.max(1, fontScale)));
}

function Row({
  label,
  index,
  y,
  rowHeight,
}: {
  label: string;
  index: number;
  y: SharedValue<number>;
  rowHeight: number;
}) {
  const style = useAnimatedStyle(() => {
    const d = Math.abs(y.value / rowHeight - index);
    return {
      opacity: interpolate(d, [0, 1, 2], [1, 0.55, 0.25], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(d, [0, 2], [1, 0.9], Extrapolation.CLAMP) }],
    };
  });
  return (
    <Animated.View
      style={[{ height: rowHeight, alignItems: 'center', justifyContent: 'center' }, style]}
    >
      <Text variant="title2" tabular>
        {label}
      </Text>
    </Animated.View>
  );
}

/** iOS-style snapping wheel (both platforms). Selection haptic per detent. */
export function WheelPicker<T>({
  items,
  value,
  onChange,
  accessibilityLabel,
  visibleRows = 5,
  testID,
}: WheelPickerProps<T>) {
  const t = useTheme();
  const { fontScale } = useWindowDimensions();
  const rowHeight = wheelRowHeight(t.sizes.wheelRow, fontScale);
  const rows = visibleRows % 2 === 1 ? visibleRows : visibleRows + 1;
  const pad = (rowHeight * (rows - 1)) / 2;
  const selectedIndex = Math.max(
    0,
    items.findIndex((i) => Object.is(i.value, value)),
  );

  const ref = useAnimatedRef<Animated.ScrollView>();
  const y = useSharedValue(selectedIndex * rowHeight);
  const lastTick = useSharedValue(selectedIndex);
  const settled = useRef(selectedIndex);

  // Keep the wheel in sync when the value changes from outside.
  useEffect(() => {
    if (settled.current !== selectedIndex) {
      settled.current = selectedIndex;
      ref.current?.scrollTo({ y: selectedIndex * rowHeight, animated: true });
    }
  }, [selectedIndex, rowHeight, ref]);

  const count = items.length;
  const onScroll = useAnimatedScrollHandler((e) => {
    y.value = e.contentOffset.y;
    const i = indexAtOffset(e.contentOffset.y, rowHeight, count);
    if (i !== lastTick.value) {
      lastTick.value = i;
      scheduleOnRN(haptics.selection);
    }
  });

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = indexAtOffset(e.nativeEvent.contentOffset.y, rowHeight, count);
    const item = items[i];
    if (item && i !== settled.current) {
      settled.current = i;
      onChange(item.value);
    }
  };

  const step = (delta: number) => {
    const item = items[indexAtOffset((selectedIndex + delta) * rowHeight, rowHeight, count)];
    if (item && !Object.is(item.value, value)) {
      haptics.selection();
      onChange(item.value);
    }
  };

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: items[selectedIndex]?.label ?? '' }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      style={{ height: rowHeight * rows, overflow: 'hidden' }}
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: pad,
          height: rowHeight,
          borderRadius: t.radius.button,
          backgroundColor: t.colors.surface2,
        }}
      />
      <Animated.ScrollView
        ref={ref}
        testID={testID ? `${testID}-scroll` : undefined}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        showsVerticalScrollIndicator={false}
        snapToInterval={rowHeight}
        decelerationRate="fast"
        contentOffset={{ x: 0, y: selectedIndex * rowHeight }}
        contentContainerStyle={{ paddingVertical: pad }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={settle}
        onScrollEndDrag={(e) => {
          // iOS fires no momentum event when the finger lifts without velocity.
          if (Platform.OS === 'ios' && Math.abs(e.nativeEvent.velocity?.y ?? 0) < 0.01) settle(e);
        }}
        // Android: no glow at the ends, and scroll inside bottom sheets.
        overScrollMode={Platform.OS === 'android' ? 'never' : undefined}
        nestedScrollEnabled={Platform.OS === 'android'}
      >
        {items.map((item, index) => (
          <Row
            key={`${index}-${item.label}`}
            label={item.label}
            index={index}
            y={y}
            rowHeight={rowHeight}
          />
        ))}
      </Animated.ScrollView>
    </View>
  );
}
