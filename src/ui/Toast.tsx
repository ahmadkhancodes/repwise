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
  /**
   * Skip the toast's success buzz. A success toast buzzes once (haptics.success) unless
   * `silent`; pass `silent: true` when the action already fired its own haptic (Tick,
   * feedback="success") or is not a core action, so nothing double-buzzes.
   */
  silent?: boolean;
};

/** Whether a toast should buzz: success tone and not silent. Pure. */
export function toastBuzzes(o: Pick<ToastOptions, 'tone' | 'silent'>): boolean {
  return o.tone === 'success' && !o.silent;
}

type ToastState = {
  current: (ToastOptions & { id: number }) | null;
  /** Pinned footers currently mounted (id → height incl. safe area), in mount order. */
  footers: [id: number, height: number][];
  show: (o: ToastOptions) => void;
  hide: () => void;
  setFooter: (id: number, height: number) => void;
  removeFooter: (id: number) => void;
};

let seq = 0;
let footerSeq = 0;
export const useToastStore = create<ToastState>((set) => ({
  current: null,
  footers: [],
  show: (o) => set({ current: { ...o, id: ++seq } }),
  hide: () => set({ current: null }),
  setFooter: (id, height) =>
    set((s) => {
      const i = s.footers.findIndex(([fid]) => fid === id);
      if (i >= 0 && s.footers[i]?.[1] === height) return s;
      const next = s.footers.slice();
      if (i >= 0) next[i] = [id, height];
      else next.push([id, height]);
      return { footers: next };
    }),
  removeFooter: (id) => set((s) => ({ footers: s.footers.filter(([fid]) => fid !== id) })),
}));

/** New id for a pinned footer (Screen calls this once per mount). */
export function nextFooterId(): number {
  return ++footerSeq;
}

/**
 * Bottom offset for the toast: above the most recently mounted pinned footer, otherwise above
 * the tab bar / home indicator. Pure, unit-tested.
 */
export function toastBottom(
  footers: readonly [number, number][],
  insetBottom: number,
  gap: number,
  tabBarClearance: number,
): number {
  const last = footers[footers.length - 1];
  return last ? last[1] + gap : insetBottom + tabBarClearance;
}

/**
 * Show a toast from anywhere (no hook needed). Only success toasts buzz, once, and only when
 * not `silent` (see ToastOptions.silent) — the single source of a core action's success haptic.
 */
export function showToast(o: ToastOptions): void {
  useToastStore.getState().show(o);
}

/** Undo window for destructive actions (sheet 11 B8): 5 s and a 48dp "Undo" pill. */
export const UNDO_TOAST_MS = 5000;

/** "Set deleted · Undo" — the shared undo pattern. `onUndo` restores the soft-deleted rows. */
export function showUndoToast(
  message: string,
  onUndo: () => void,
  options: { actionLabel?: string; durationMs?: number } = {},
): void {
  showToast({
    message,
    actionLabel: options.actionLabel ?? 'Undo',
    onAction: onUndo,
    durationMs: options.durationMs ?? UNDO_TOAST_MS,
    silent: true,
  });
}

const TONE: Record<ToastTone, { icon: LucideIcon; color: ColorToken }> = {
  default: { icon: Info, color: 'onInverse' },
  success: { icon: CircleCheck, color: 'accentOnInverse' },
  danger: { icon: TriangleAlert, color: 'dangerOnInverse' },
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
        paddingRight: actionLabel ? t.spacing.xs : t.spacing.md,
        borderRadius: t.radius.card,
        backgroundColor: t.colors.inverse,
      }}
    >
      <Icon color={t.colors[color]} size={t.sizes.icon} strokeWidth={t.sizes.iconStroke} />
      <Text variant="callout" style={{ flex: 1, color: t.colors.onInverse }}>
        {message}
      </Text>
      {actionLabel ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={() => {
            haptics.light();
            // Dismiss first: an action may show its own toast ("Nothing was deleted."), which
            // dismissing afterwards would hide at once.
            onDismiss?.();
            onAction?.();
          }}
          hitSlop={t.spacing.xxs}
          style={{
            minHeight: t.sizes.touch,
            minWidth: t.sizes.touch,
            marginVertical: t.spacing.xxs,
            paddingHorizontal: t.spacing.md,
            borderRadius: t.radius.pill,
            borderWidth: t.sizes.borderThick,
            borderColor: t.colors.onInverse,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="headline" style={{ color: t.colors.onInverse }}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Mount once at the root. Renders the latest toast above the active pinned footer (Screen
 * registers it) or above the tab bar, so it never covers "Log set" / the rest bar.
 */
export function ToastHost() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const current = useToastStore((s) => s.current);
  const hide = useToastStore((s) => s.hide);
  const footers = useToastStore((s) => s.footers);

  useEffect(() => {
    if (!current) return;
    if (toastBuzzes(current)) haptics.success();
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
        bottom: toastBottom(footers, insets.bottom, t.spacing.sm, t.spacing.huge + t.spacing.xl),
      }}
    >
      <Toast {...current} onDismiss={hide} testID="toast" />
    </Animated.View>
  );
}
