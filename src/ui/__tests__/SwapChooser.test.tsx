import { fireEvent, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { renderThemed, SCHEMES } from '../../../test/render';
import { SwapChooser, type SwapChooserProps } from '../SwapChooser';
import { Text } from '../Text';

const base = (over: Partial<SwapChooserProps> = {}): SwapChooserProps => ({
  open: true,
  onClose: jest.fn(),
  title: 'Swap exercise',
  intro: 'Instead of Bench press.',
  state: 'ready',
  choices: [
    {
      key: 'a',
      title: 'Dumbbell press',
      subtitle: 'Chest · Dumbbell',
      accessibilityLabel: 'Swap to Dumbbell press',
      detail: <Text>detail</Text>,
    },
    { key: 'b', title: 'Push-up', accessibilityLabel: 'Swap to Push-up' },
  ],
  onPick: jest.fn(),
  empty: { title: 'No alternatives', body: 'Nothing fits.' },
  ...over,
});

describe.each(SCHEMES)(`SwapChooser (%s, ${Platform.OS})`, (scheme) => {
  it('lists choices; one tap picks; never is a tertiary action', async () => {
    const onPress = jest.fn();
    const p = base({ never: { label: 'Never suggest Bench press', onPress } });
    await renderThemed(<SwapChooser {...p} />, scheme);
    expect(screen.getByText('Instead of Bench press.')).toBeTruthy();
    expect(screen.getByText('Chest · Dumbbell')).toBeTruthy();
    expect(screen.getByText('detail')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Swap to Push-up' }));
    expect(p.onPick).toHaveBeenCalledWith('b');
    await fireEvent.press(screen.getByTestId('swap-never'));
    expect(onPress).toHaveBeenCalled();
  });

  it('loading shows a skeleton, error offers a retry, empty explains', async () => {
    const onRetry = jest.fn();
    const { rerender } = await renderThemed(
      <SwapChooser {...base({ state: 'loading' })} />,
      scheme,
    );
    expect(screen.getByTestId('swap-loading')).toBeTruthy();
    await rerender(<SwapChooser {...base({ state: 'error', onRetry })} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
    await rerender(<SwapChooser {...base({ choices: [] })} />);
    expect(screen.getByTestId('swap-empty')).toBeTruthy();
    expect(screen.queryByTestId('swap-never')).toBeNull();
  });
});
