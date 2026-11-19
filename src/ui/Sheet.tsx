import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { BackHandler, Platform, View } from 'react-native';
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
  testID?: string;
};

/**
 * Bottom sheet for every secondary action (sheet 11): swap, log, filters.
 * Radius 16, grabber, scrim backdrop, visible close button. Android's back
 * button closes it before leaving the screen.
 */
export function Sheet({ open, onClose, title, children, snapPoints, testID }: SheetProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const ref = useRef<BottomSheetModal>(null);

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

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={snapPoints}
      enableDynamicSizing={!snapPoints}
      onDismiss={onClose}
      backdropComponent={renderBackdrop}
      animateOnMount={!reduceMotion}
      backgroundStyle={{
        backgroundColor: t.colors.bg,
        borderTopLeftRadius: t.radius.sheet,
        borderTopRightRadius: t.radius.sheet,
      }}
      handleIndicatorStyle={{ backgroundColor: t.colors.border, width: t.spacing.xxxl }}
      accessibilityLabel={title}
    >
      <BottomSheetView
        testID={testID}
        style={{
          paddingHorizontal: t.spacing.screen,
          paddingBottom: insets.bottom + t.spacing.lg,
          gap: t.spacing.md,
        }}
      >
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
        {children}
      </BottomSheetView>
    </BottomSheetModal>
  );
}
