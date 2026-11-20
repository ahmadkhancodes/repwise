import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { KeyboardAvoidingView, View, type StyleProp, type ViewStyle } from 'react-native';
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
  /**
   * Virtualised screens (history, library): render an `Animated.FlatList`/`SectionList` with
   * these props so the large title scrolls with the list and collapses into the bar, exactly
   * like a scroll screen. Takes the place of `children` and `scroll`.
   */
  list?: (props: ScreenListProps) => ReactNode;
  /** Trailing header action(s), e.g. a settings icon button. */
  headerRight?: ReactNode;
  /** Leading header action, e.g. a close button on modals. */
  headerLeft?: ReactNode;
  /** Pinned bottom area — the one primary button lives here (sheet 11). */
  footer?: ReactNode;
  /** Safe-area edges to pad. Tab screens pass ['top'] (the tab bar owns the bottom). */
  edges?: ('top' | 'bottom')[];
  /**
   * Screens with text inputs: the body and the pinned footer rise above the keyboard
   * (padding on both platforms — Android runs edge-to-edge, so the window never resizes),
   * and dragging the content dismisses it.
   */
  keyboard?: boolean;
  testID?: string;
  contentStyle?: StyleProp<ViewStyle>;
};

/** Props {@link Screen} hands a `list` renderer. Spread them onto an Animated list. */
export type ScreenListProps = {
  onScroll: ReturnType<typeof useAnimatedScrollHandler>;
  scrollEventThrottle: number;
  keyboardShouldPersistTaps: 'handled';
  contentContainerStyle: StyleProp<ViewStyle>;
  /** The large title; put it first in your ListHeaderComponent. */
  largeTitle: ReactElement | null;
};

/** KeyboardAvoidingView behaviour for {@link Screen}'s `keyboard` prop, per platform (D?: one rule). */
export const SCREEN_KEYBOARD_BEHAVIOR = 'padding' as const;

const COLLAPSE_START = 8;
const COLLAPSE_END = 40;

export function Screen({
  title,
  children,
  scroll = true,
  list,
  headerRight,
  headerLeft,
  footer,
  edges = ['top', 'bottom'],
  keyboard = false,
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

  // The large title eases up and shrinks a touch as it hands over to the compact bar.
  const largeTitleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, COLLAPSE_END], [1, 0], Extrapolation.CLAMP),
    transform: [
      { scale: interpolate(scrollY.value, [0, COLLAPSE_END], [1, 0.94], Extrapolation.CLAMP) },
    ],
    transformOrigin: 'left center',
  }));

  const scrolls = scroll || Boolean(list);
  const hasBar = Boolean(title || headerLeft || headerRight);
  const body: ViewStyle = {
    paddingHorizontal: t.spacing.screen,
    paddingBottom: footer ? t.spacing.xl : bottom + t.spacing.xl,
    gap: t.spacing.md,
  };

  const largeTitle = title ? (
    <Animated.View style={scrolls ? largeTitleStyle : undefined}>
      <Text
        variant="title1"
        accessibilityRole="header"
        testID={testID ? `${testID}-title` : undefined}
      >
        {title}
      </Text>
    </Animated.View>
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
            style={[
              { flex: 1, alignItems: 'center' },
              scrolls ? compactTitleStyle : { opacity: 0 },
            ]}
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

      <Body keyboard={keyboard} testID={testID ? `${testID}-keyboard` : undefined}>
        {list ? (
          <View testID={testID ? `${testID}-list` : undefined} style={{ flex: 1 }}>
            {list({
              onScroll,
              scrollEventThrottle: 16,
              keyboardShouldPersistTaps: 'handled',
              contentContainerStyle: [body, contentStyle],
              largeTitle,
            })}
          </View>
        ) : scroll ? (
          <Animated.ScrollView
            onScroll={onScroll}
            scrollEventThrottle={16}
            contentContainerStyle={[body, contentStyle]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={keyboard ? 'on-drag' : 'none'}
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
      </Body>
    </View>
  );
}

function Body({
  keyboard,
  testID,
  children,
}: {
  keyboard: boolean;
  testID?: string;
  children: ReactNode;
}) {
  if (!keyboard) return <>{children}</>;
  return (
    <KeyboardAvoidingView testID={testID} behavior={SCREEN_KEYBOARD_BEHAVIOR} style={{ flex: 1 }}>
      {children}
    </KeyboardAvoidingView>
  );
}
