import { X } from 'lucide-react-native';
import { useEffect, useId, useLayoutEffect, type ReactNode } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { useTheme } from '@/theme';

import { IconButton } from './IconButton';
import { Text } from './Text';

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Fixed snap points; omit to size to content (default). */
  snapPoints?: (string | number)[];
  /**
   * Long content (ingredients, filters, a 12-exercise reorder): the body scrolls inside the
   * sheet, the title row stays pinned, and the sheet never grows past {@link SHEET_MAX_RATIO}
   * of the screen.
   */
  scrollable?: boolean;
  /** Pinned under the body (scrollable sheets): the one primary action, e.g. "Show 24". */
  footer?: ReactNode;
  testID?: string;
};

/** Tallest a content-sized sheet gets, as a share of the window (the scrim stays tappable). */
export const SHEET_MAX_RATIO = 0.9;

/** Max sheet height in dp for a window height and top inset. Pure. */
export function sheetMaxHeight(windowHeight: number, topInset: number): number {
  return Math.max(0, Math.round(windowHeight * SHEET_MAX_RATIO - topInset));
}

/** Open sheets drawn by the root {@link SheetHost} (above every screen), by sheet id. */
const useSheetPortal = create<{
  hosts: number;
  nodes: Record<string, ReactNode>;
}>(() => ({ hosts: 0, nodes: {} }));

function putSheet(id: string, node: ReactNode | null): void {
  useSheetPortal.setState((s) => {
    const nodes = { ...s.nodes };
    if (node) nodes[id] = node;
    else delete nodes[id];
    return { nodes };
  });
}

/**
 * Mount once at the app root, above the navigator (app/_layout.tsx). Sheets render here, over
 * every screen, like a portal. Without a host (component tests) a sheet renders in place.
 */
export function SheetHost() {
  const nodes = useSheetPortal((s) => s.nodes);
  useEffect(() => {
    useSheetPortal.setState((s) => ({ hosts: s.hosts + 1 }));
    return () => useSheetPortal.setState((s) => ({ hosts: s.hosts - 1 }));
  }, []);
  const open = Object.entries(nodes);
  if (open.length === 0) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {open.map(([id, node]) => (
        <View key={id} style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {node}
        </View>
      ))}
    </View>
  );
}

/** Height of a fixed snap point ('60%' of the window, or dp). Pure. */
export function snapHeight(point: string | number, windowHeight: number): number {
  if (typeof point === 'number') return point;
  const pct = Number.parseFloat(point);
  return Number.isFinite(pct) ? Math.round((windowHeight * pct) / 100) : windowHeight;
}

/**
 * Bottom sheet for every secondary action (sheet 11): swap, log, filters.
 * Radius 16, grabber, scrim backdrop, visible close button. Android's back
 * button closes it before leaving the screen.
 *
 * A plain overlay drawn by {@link SheetHost} (scrim + panel that springs up). @gorhom/bottom-sheet
 * 5.2.14 never opens with Reanimated 4.3+ on the New Architecture (gorhom issue #2696): on the
 * first device builds no sheet appeared. No native Modal either: iOS cannot present one while
 * another is animating away, and screens swap sheets in one render (menu → discard).
 */
export function Sheet(props: SheetProps) {
  const id = useId();
  const hosted = useSheetPortal((s) => s.hosts > 0);
  const { open, onClose } = props;

  useEffect(() => {
    if (!open || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);

  const node = open ? <SheetPanel {...props} /> : null;
  useLayoutEffect(() => {
    if (hosted) putSheet(id, node);
  });
  useLayoutEffect(() => () => putSheet(id, null), [id]);
  if (hosted || !node) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {node}
    </View>
  );
}

function SheetPanel({
  onClose,
  title,
  children,
  snapPoints,
  scrollable = false,
  footer,
  testID,
}: SheetProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const maxHeight = sheetMaxHeight(height, insets.top);
  const fixedHeight = snapPoints?.length
    ? Math.min(maxHeight, snapHeight(snapPoints[snapPoints.length - 1]!, height))
    : undefined;

  // Springs up from below when it mounts (Reanimated honours reduced motion: it then jumps).
  const offset = useSharedValue(height);
  useEffect(() => {
    offset.value = withSpring(0, {
      damping: t.motion.spring.damping,
      stiffness: t.motion.spring.stiffness,
      mass: t.motion.spring.mass,
      overshootClamping: true,
    });
  }, [offset, t.motion.spring]);
  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}>
      <View style={{ flex: 1 }}>
        {title ? (
          <Text variant="title2" accessibilityRole="header">
            {title}
          </Text>
        ) : null}
      </View>
      <IconButton
        icon={X}
        accessibilityLabel="Close"
        onPress={onClose}
        testID={testID ? `${testID}-close` : undefined}
      />
    </View>
  );
  const pad = { paddingHorizontal: t.spacing.screen } as const;
  const bottomPad = insets.bottom + t.spacing.lg;

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close sheet"
        onPress={onClose}
        style={[StyleSheet.absoluteFill, { backgroundColor: t.colors.scrim }]}
        testID={testID ? `${testID}-scrim` : undefined}
      />
      <Animated.View
        accessibilityViewIsModal
        style={[
          {
            maxHeight,
            height: fixedHeight,
            backgroundColor: t.colors.bg,
            borderTopLeftRadius: t.radius.sheet,
            borderTopRightRadius: t.radius.sheet,
            paddingTop: t.spacing.xs,
          },
          slide,
        ]}
      >
        <View
          style={{
            alignSelf: 'center',
            width: t.spacing.xxxl,
            height: t.spacing.xxs,
            borderRadius: t.spacing.xxs,
            backgroundColor: t.colors.borderStrong,
            marginBottom: t.spacing.xs,
          }}
        />
        {scrollable ? (
          // Column capped at maxHeight: header + footer keep their size, the scroll view shrinks.
          <View testID={testID} style={{ flexShrink: 1 }}>
            <View style={[pad, { paddingBottom: t.spacing.xs }]}>{header}</View>
            <ScrollView
              testID={testID ? `${testID}-scroll` : undefined}
              style={{ flexShrink: 1 }}
              contentContainerStyle={[
                pad,
                { gap: t.spacing.md, paddingBottom: footer ? t.spacing.md : bottomPad },
              ]}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
            {footer ? (
              <View
                testID={testID ? `${testID}-footer` : undefined}
                style={[
                  pad,
                  {
                    gap: t.spacing.xs,
                    paddingTop: t.spacing.sm,
                    paddingBottom: bottomPad,
                    borderTopWidth: t.sizes.hairline,
                    borderTopColor: t.colors.border,
                  },
                ]}
              >
                {footer}
              </View>
            ) : null}
          </View>
        ) : (
          <View testID={testID} style={[pad, { paddingBottom: bottomPad, gap: t.spacing.md }]}>
            {header}
            {children}
            {footer}
          </View>
        )}
      </Animated.View>
    </KeyboardAvoidingView>
  );
}
