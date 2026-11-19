import { act, fireEvent, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { colors, motion } from '@/theme';

import { flat, renderThemed, SCHEMES } from '../../../test/render';
import { showToast, Toast, ToastHost, useToastStore } from '../Toast';

describe.each(SCHEMES)('Toast (%s)', (scheme) => {
  beforeEach(() => {
    jest.useFakeTimers();
    useToastStore.setState({ current: null });
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
