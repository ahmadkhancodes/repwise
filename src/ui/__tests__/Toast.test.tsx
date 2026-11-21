import { act, fireEvent, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { AccessibilityInfo, AppState, Platform, type AppStateStatus } from 'react-native';

import { colors, motion } from '@/theme';

import { flat, renderThemed, SCHEMES } from '../../../test/render';
import {
  holdToasts,
  showToast,
  showUndoToast,
  Toast,
  toastBottom,
  toastBuzzes,
  ToastHost,
  UNDO_TOAST_MS,
  useToastStore,
} from '../Toast';

describe('toastBuzzes', () => {
  it('only success, only when not silent', () => {
    expect(toastBuzzes({ tone: 'success' })).toBe(true);
    expect(toastBuzzes({ tone: 'success', silent: true })).toBe(false);
    expect(toastBuzzes({ tone: 'danger' })).toBe(false);
    expect(toastBuzzes({})).toBe(false);
  });
});

describe('toastBottom', () => {
  it('sits above the latest pinned footer, else above the tab bar', () => {
    expect(toastBottom([], 34, 12, 72)).toBe(106);
    expect(toastBottom([[1, 120]], 34, 12, 72)).toBe(132);
    expect(
      toastBottom(
        [
          [1, 120],
          [2, 90],
        ],
        34,
        12,
        72,
      ),
    ).toBe(102);
  });
});

describe.each(SCHEMES)('Toast (%s)', (scheme) => {
  beforeEach(() => {
    jest.useFakeTimers();
    useToastStore.setState({ current: null, footers: [], held: false });
    jest.clearAllMocks();
  });
  afterEach(() => jest.useRealTimers());

  it.each(['default', 'success', 'danger'] as const)(
    '%s tone renders an inverse alert',
    async (tone) => {
      await renderThemed(<Toast message="Saved" tone={tone} testID="t" />, scheme);
      const el = screen.getByTestId('t');
      expect(el.props.accessibilityRole).toBe('alert');
      expect(flat(el.props.style).backgroundColor).toBe(colors[scheme].inverse);
      expect(el.props.accessibilityLiveRegion).toBe('polite');
      expect(screen.getByText('Saved')).toBeTruthy();
    },
  );

  it('action button runs and dismisses', async () => {
    const onAction = jest.fn();
    const onDismiss = jest.fn();
    await renderThemed(
      <Toast message="Set deleted" actionLabel="Undo" onAction={onAction} onDismiss={onDismiss} />,
      scheme,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
    expect(onAction).toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
  });

  it('icons stay AA on the inverse pill (accent/danger OnInverse)', async () => {
    await renderThemed(<Toast message="Saved" tone="success" testID="t" />, scheme);
    expect(screen.getByTestId('t')).toBeTruthy();
    expect(colors[scheme].accentOnInverse).not.toBe(colors[scheme].inverse);
  });

  it('a success toast buzzes once; silent and non-success toasts never do', async () => {
    const buzzes = () =>
      jest.mocked(Haptics.notificationAsync).mock.calls.length +
      jest.mocked(Haptics.performAndroidHapticsAsync).mock.calls.length;
    await renderThemed(<ToastHost />, scheme);
    await act(() => showToast({ message: 'Saved', tone: 'success', silent: true }));
    await act(() => showToast({ message: 'Removed' }));
    expect(buzzes()).toBe(0);
    await act(() => showToast({ message: 'Lunch logged', tone: 'success' }));
    expect(buzzes()).toBe(1);
  });

  it('showUndoToast: 5 s window with a 48dp Undo pill', async () => {
    const onUndo = jest.fn();
    await renderThemed(<ToastHost />, scheme);
    await act(() => showUndoToast('Set deleted', onUndo));
    const undo = screen.getByRole('button', { name: 'Undo' });
    expect(flat(undo.props.style).minHeight).toBe(48);
    await act(() => jest.advanceTimersByTime(motion.toastMs));
    expect(screen.getByTestId('toast')).toBeTruthy();
    await fireEvent.press(undo);
    expect(onUndo).toHaveBeenCalled();
    expect(screen.queryByTestId('toast')).toBeNull();
    expect(UNDO_TOAST_MS).toBe(5000);
  });

  it('a toast shown by the Undo action stays up (it is not dismissed with the undo toast)', async () => {
    await renderThemed(<ToastHost />, scheme);
    await act(() =>
      showUndoToast('Deleting your data…', () => showToast({ message: 'Nothing was deleted.' })),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByText('Nothing was deleted.')).toBeTruthy();
  });

  it('a toast raised behind the splash waits, then gets its full time (cold-start links)', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    holdToasts(true);
    await renderThemed(<ToastHost />, scheme);
    await act(() => showToast({ message: 'Lunch logged' }));
    await act(() => jest.advanceTimersByTime(motion.toastMs * 2));
    expect(screen.queryByTestId('toast')).toBeNull();
    expect(announce).not.toHaveBeenCalled();
    await act(() => holdToasts(false));
    expect(screen.getByTestId('toast')).toBeTruthy();
    expect(announce).toHaveBeenCalledWith('Lunch logged');
    await act(() => jest.advanceTimersByTime(motion.toastMs - 100));
    expect(screen.getByTestId('toast')).toBeTruthy();
    await act(() => jest.advanceTimersByTime(100));
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('the clock stops while the app is in the background and resumes with the time left', async () => {
    const listeners: ((s: AppStateStatus) => void)[] = [];
    const add = jest.spyOn(AppState, 'addEventListener').mockImplementation((_e, fn) => {
      listeners.push(fn as (s: AppStateStatus) => void);
      return { remove: jest.fn() } as never;
    });
    const emit = (s: AppStateStatus) => listeners.forEach((fn) => fn(s));
    await renderThemed(<ToastHost />, scheme);
    await act(() => showUndoToast('Lunch logged', jest.fn()));
    await act(() => jest.advanceTimersByTime(2000));
    await act(() => emit('background'));
    expect(screen.queryByTestId('toast')).toBeNull();
    await act(() => jest.advanceTimersByTime(60_000));
    await act(() => emit('active'));
    // 3 s of the 5 s undo window are left.
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    await act(() => jest.advanceTimersByTime(2900));
    expect(screen.getByTestId('toast')).toBeTruthy();
    await act(() => jest.advanceTimersByTime(100));
    expect(screen.queryByTestId('toast')).toBeNull();
    add.mockRestore();
  });

  it('iOS draws toasts in a full-window overlay (above native modals); Android in place', async () => {
    await renderThemed(<ToastHost />, scheme);
    await act(() => showToast({ message: 'Nothing to restore' }));
    type Host = { type?: unknown; parent?: Host | null };
    let n: Host | null | undefined = screen.getByTestId('toast') as unknown as Host;
    let inOverlay = false;
    while (n) {
      if (n.type === 'RNSFullWindowOverlay') inOverlay = true;
      n = n.parent;
    }
    expect(inOverlay).toBe(Platform.OS === 'ios');
  });

  it('ToastHost shows, announces and auto-hides', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await renderThemed(<ToastHost />, scheme);
    expect(screen.queryByTestId('toast')).toBeNull();
    await act(() => showToast({ message: 'Workout saved', tone: 'success' }));
    expect(screen.getByTestId('toast')).toBeTruthy();
    expect(announce).toHaveBeenCalledWith('Workout saved');
    await act(() => jest.advanceTimersByTime(motion.toastMs));
    expect(screen.queryByTestId('toast')).toBeNull();
  });
});
