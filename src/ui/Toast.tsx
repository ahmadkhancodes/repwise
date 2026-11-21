import { CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  AppState,
  Platform,
  Pressable,
  View,
  type AppStateStatus,
} from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';
import { create } from 'zustand';

import { haptics } from '@/services/haptics';
import { useTheme, type ColorToken } from '@/theme';

import { Text } from './Text';
import { useMotionSafe } from './motion';

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
  /** Launch: the splash still covers the app, so no toast is shown or timed yet. */
  held: boolean;
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
  held: false,
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

/**
 * Hold toasts while the app is not visible yet (the root holds them until the splash is gone).
 * A toast raised meanwhile (a widget "Ate it" link on a cold start) waits and then gets its full
 * time on screen instead of running out behind the splash.
 */
export function holdToasts(held: boolean): void {
  useToastStore.setState({ held });
}

/** Whether the app is in the foreground (a toast's clock only runs while it is). */
function isForeground(state: AppStateStatus | string | null | undefined): boolean {
  return state !== 'background' && state !== 'inactive';
}

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
  const safe = useMotionSafe();
  const insets = useSafeAreaInsets();
  const current = useToastStore((s) => s.current);
  const held = useToastStore((s) => s.held);
  const hide = useToastStore((s) => s.hide);
  const footers = useToastStore((s) => s.footers);
  const [foreground, setForeground] = useState(() => isForeground(AppState.currentState));
  // Time left for the current toast; it only counts down while the toast is on screen.
  const left = useRef<{ id: number; ms: number } | null>(null);
  const shown = current && !held && foreground ? current : null;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setForeground(isForeground(s)));
    return () => sub?.remove();
  }, []);

  // Buzz + announce once per toast, when it first appears.
  const announced = useRef<number | null>(null);
  useEffect(() => {
    if (!shown || announced.current === shown.id) return;
    announced.current = shown.id;
    if (toastBuzzes(shown)) haptics.success();
    AccessibilityInfo.announceForAccessibility(shown.message);
  }, [shown]);

  useEffect(() => {
    if (!shown) return;
    if (left.current?.id !== shown.id) {
      left.current = { id: shown.id, ms: shown.durationMs ?? t.motion.toastMs };
    }
    const entry = left.current;
    const started = Date.now();
    const timer = setTimeout(hide, entry.ms);
    return () => {
      clearTimeout(timer);
      // Paused (backgrounded or held): keep what is left for when it shows again.
      entry.ms = Math.max(0, entry.ms - (Date.now() - started));
    };
  }, [shown, hide, t.motion.toastMs]);

  return (
    <ToastLayer>
      {shown ? (
        <Animated.View
          key={shown.id}
          entering={safe(FadeInDown.duration(t.motion.duration.base))}
          exiting={safe(FadeOutDown.duration(t.motion.duration.fast))}
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: t.spacing.screen,
            right: t.spacing.screen,
            bottom: toastBottom(footers, insets.bottom, t.spacing.sm, t.spacing.huge + t.spacing.xl),
          }}
        >
          <Toast {...shown} onDismiss={hide} testID="toast" />
        </Animated.View>
      ) : null}
    </ToastLayer>
  );
}

/**
 * iOS: toasts draw in a full-window overlay, above native modals (paywall, exercise picker, body
 * log). A native modal covers the root view, so "Nothing to restore" on the paywall was shown
 * behind it. The overlay only takes touches on the toast itself. Android modals are in-window.
 */
function ToastLayer({ children }: { children: ReactNode }) {
  if (Platform.OS !== 'ios') return <>{children}</>;
  return <FullWindowOverlay>{children}</FullWindowOverlay>;
}
