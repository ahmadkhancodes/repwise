import { useEffect, useState, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  Extrapolation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import { Text } from './Text';
import { nextFooterId, useToastStore } from './Toast';

export type ScreenProps = {
  /** Large bold title (title1) that collapses into the compact bar on scroll. */
  title?: string;
  children?: ReactNode;
  /** Scrollable content (default) or a fixed layout. */
  scroll?: boolean;
  /** Trailing header action(s), e.g. a settings icon button. */
  headerRight?: ReactNode;
  /** Leading header action, e.g. a close button on modals. */
  headerLeft?: ReactNode;
  /** Pinned bottom area — the one primary button lives here (sheet 11). */
  footer?: ReactNode;
  /** Safe-area edges to pad. Tab screens pass ['top'] (the tab bar owns the bottom). */
  edges?: ('top' | 'bottom')[];
  testID?: string;
  contentStyle?: StyleProp<ViewStyle>;
};

const COLLAPSE_START = 8;
const COLLAPSE_END = 40;

export function Screen({
  title,
  children,
  scroll = true,
  headerRight,
  headerLeft,
  footer,
  edges = ['top', 'bottom'],
  testID,
  contentStyle,
}: ScreenProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const top = edges.includes('top') ? insets.top : 0;
  const bottom = edges.includes('bottom') ? insets.bottom : 0;
  const scrollY = useSharedValue(0);
  const [footerId] = useState(nextFooterId);
  const hasFooter = Boolean(footer);

  // Toasts sit above this screen's pinned footer while it is mounted (audit B9).
  useEffect(() => {
    if (!hasFooter) return;
    return () => useToastStore.getState().removeFooter(footerId);
  }, [hasFooter, footerId]);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const compactTitleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [COLLAPSE_START, COLLAPSE_END],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));
  const dividerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [COLLAPSE_START, COLLAPSE_END],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const hasBar = Boolean(title || headerLeft || headerRight);
  const body: ViewStyle = {
    paddingHorizontal: t.spacing.screen,
    paddingBottom: footer ? t.spacing.xl : bottom + t.spacing.xl,
    gap: t.spacing.md,
  };

  const largeTitle = title ? (
    <Text
      variant="title1"
      accessibilityRole="header"
      testID={testID ? `${testID}-title` : undefined}
    >
      {title}
    </Text>
  ) : null;

  return (
    <View testID={testID} style={{ flex: 1, backgroundColor: t.colors.bg, paddingTop: top }}>
      {hasBar ? (
        <View
          style={{
            minHeight: t.sizes.touch,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: t.spacing.xs,
          }}
        >
          <View style={{ minWidth: t.sizes.touch, alignItems: 'flex-start' }}>{headerLeft}</View>
          <Animated.View
            style={[{ flex: 1, alignItems: 'center' }, scroll ? compactTitleStyle : { opacity: 0 }]}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
          >
            {title ? (
              <Text variant="headline" numberOfLines={1}>
                {title}
              </Text>
            ) : null}
          </Animated.View>
          <View style={{ minWidth: t.sizes.touch, alignItems: 'flex-end' }}>{headerRight}</View>
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: t.sizes.hairline,
                backgroundColor: t.colors.border,
              },
              dividerStyle,
            ]}
          />
        </View>
      ) : null}

      {scroll ? (
        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={[body, contentStyle]}
          keyboardShouldPersistTaps="handled"
        >
          {largeTitle}
          {children}
        </Animated.ScrollView>
      ) : (
        <View
          testID={testID ? `${testID}-content` : undefined}
          style={[{ flex: 1 }, body, contentStyle]}
        >
          {largeTitle}
          {children}
        </View>
      )}

      {footer ? (
        <View
          testID={testID ? `${testID}-footer` : undefined}
          onLayout={(e) =>
            useToastStore.getState().setFooter(footerId, e.nativeEvent.layout.height)
          }
          style={{
            paddingHorizontal: t.spacing.screen,
            paddingTop: t.spacing.sm,
            paddingBottom: bottom + t.spacing.sm,
            backgroundColor: t.colors.bg,
            gap: t.spacing.xs,
          }}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}
