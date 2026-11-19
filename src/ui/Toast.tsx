import { CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { haptics } from '@/services/haptics';
import { useTheme, type ColorToken } from '@/theme';

import { Text } from './Text';

export type ToastTone = 'default' | 'success' | 'danger';

export type ToastOptions = {
  message: string;
  tone?: ToastTone;
  /** e.g. "Undo". */
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
};

type ToastState = {
  current: (ToastOptions & { id: number }) | null;
  show: (o: ToastOptions) => void;
  hide: () => void;
};

let seq = 0;
export const useToastStore = create<ToastState>((set) => ({
  current: null,
  show: (o) => set({ current: { ...o, id: ++seq } }),
  hide: () => set({ current: null }),
}));

/** Show a toast from anywhere (no hook needed). */
export function showToast(o: ToastOptions): void {
  useToastStore.getState().show(o);
}

const TONE: Record<ToastTone, { icon: LucideIcon; color: ColorToken }> = {
  default: { icon: Info, color: 'onInverse' },
  success: { icon: CircleCheck, color: 'accent' },
  danger: { icon: TriangleAlert, color: 'danger' },
};

export type ToastProps = ToastOptions & { onDismiss?: () => void; testID?: string };

/** Inverse pill (black in light, white in dark) with an optional action. */
export function Toast({
  message,
  tone = 'default',
  actionLabel,
  onAction,
  onDismiss,
  testID,
}: ToastProps) {
  const t = useTheme();
  const { icon: Icon, color } = TONE[tone];
  return (
    <View
      testID={testID}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.sm,
        minHeight: t.sizes.button,
        paddingLeft: t.spacing.md,
        paddingRight: actionLabel ? t.spacing.xxs : t.spacing.md,
        borderRadius: t.radius.card,
        backgroundColor: t.colors.inverse,
      }}
    >
      <Icon
        color={tone === 'default' ? t.colors.onInverse : t.colors[color]}
        size={t.sizes.icon}
        strokeWidth={t.sizes.iconStroke}
      />
      <Text variant="callout" style={{ flex: 1, color: t.colors.onInverse }}>
        {message}
      </Text>
      {actionLabel ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={() => {
            haptics.light();
            onAction?.();
            onDismiss?.();
          }}
          style={{
            minHeight: t.sizes.touch,
            minWidth: t.sizes.touch,
            paddingHorizontal: t.spacing.sm,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            variant="callout"
            style={{ color: t.colors.onInverse, textDecorationLine: 'underline' }}
          >
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Mount once at the root. Renders the latest toast above the bottom safe area. */
export function ToastHost() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const current = useToastStore((s) => s.current);
  const hide = useToastStore((s) => s.hide);

  useEffect(() => {
    if (!current) return;
    if (current.tone === 'success') haptics.success();
    AccessibilityInfo.announceForAccessibility(current.message);
    const timer = setTimeout(hide, current.durationMs ?? t.motion.toastMs);
    return () => clearTimeout(timer);
  }, [current, hide, t.motion.toastMs]);

  if (!current) return null;
  return (
    <Animated.View
      key={current.id}
      entering={reduceMotion ? undefined : FadeInDown.duration(t.motion.duration.base)}
      exiting={reduceMotion ? undefined : FadeOutDown.duration(t.motion.duration.fast)}
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: t.spacing.screen,
        right: t.spacing.screen,
        bottom: insets.bottom + t.spacing.huge + t.spacing.xl,
      }}
    >
      <Toast {...current} onDismiss={hide} testID="toast" />
    </Animated.View>
  );
}
