import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { BackHandler, Platform, useWindowDimensions, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
   * sheet with gorhom's own scroll view (so the pan gesture never swallows it on Android),
   * the title row stays pinned, and the sheet never grows past {@link SHEET_MAX_RATIO} of
   * the screen.
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

/**
 * Bottom sheet for every secondary action (sheet 11): swap, log, filters.
 * Radius 16, grabber, scrim backdrop, visible close button. Android's back
 * button closes it before leaving the screen.
 */
export function Sheet({
  open,
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
  const reduceMotion = useReducedMotion();
  const ref = useRef<BottomSheetModal>(null);
  const maxHeight = sheetMaxHeight(height, insets.top);

  useEffect(() => {
    if (open) ref.current?.present();
    else ref.current?.dismiss();
  }, [open]);

  useEffect(() => {
    if (!open || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
        style={[props.style, { backgroundColor: t.colors.scrim }]}
        opacity={1}
      />
    ),
    [t.colors.scrim],
  );

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
    <BottomSheetModal
      ref={ref}
      snapPoints={snapPoints}
      enableDynamicSizing={!snapPoints}
      maxDynamicContentSize={maxHeight}
      onDismiss={onClose}
      backdropComponent={renderBackdrop}
      animateOnMount={!reduceMotion}
      backgroundStyle={{
        backgroundColor: t.colors.bg,
        borderTopLeftRadius: t.radius.sheet,
        borderTopRightRadius: t.radius.sheet,
      }}
      handleIndicatorStyle={{ backgroundColor: t.colors.borderStrong, width: t.spacing.xxxl }}
      accessibilityLabel={title}
    >
      {scrollable ? (
        // Column capped at maxHeight: header + footer keep their size, the scroll view shrinks.
        <BottomSheetView style={{ maxHeight }}>
          <View testID={testID} style={{ flexShrink: 1 }}>
            <View style={[pad, { paddingBottom: t.spacing.xs }]}>{header}</View>
            <BottomSheetScrollView
              testID={testID ? `${testID}-scroll` : undefined}
              style={{ flexShrink: 1 }}
              contentContainerStyle={[
                pad,
                { gap: t.spacing.md, paddingBottom: footer ? t.spacing.md : bottomPad },
              ]}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </BottomSheetScrollView>
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
        </BottomSheetView>
      ) : (
        <BottomSheetView>
          <View testID={testID} style={[pad, { paddingBottom: bottomPad, gap: t.spacing.md }]}>
            {header}
            {children}
            {footer}
          </View>
        </BottomSheetView>
      )}
    </BottomSheetModal>
  );
}
