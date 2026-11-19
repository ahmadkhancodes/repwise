import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { fireEvent, screen } from '@testing-library/react-native';
import { BackHandler, Platform } from 'react-native';

import { renderThemed, SCHEMES } from '../../../test/render';
import { Sheet } from '../Sheet';
import { Text } from '../Text';

describe.each(SCHEMES)('Sheet (%s)', (scheme) => {
  afterEach(() => jest.restoreAllMocks());

  it('presents when open and shows title, content and a labelled close button', async () => {
    const present = jest.spyOn(BottomSheetModal.prototype, 'present');
    const onClose = jest.fn();
    await renderThemed(
      <Sheet open onClose={onClose} title="Swap exercise" testID="s">
        <Text>Alternatives</Text>
      </Sheet>,
      scheme,
    );
    expect(present).toHaveBeenCalled();
    expect(screen.getByRole('header', { name: 'Swap exercise' })).toBeTruthy();
    expect(screen.getByText('Alternatives')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('dismisses when closed', async () => {
    const dismiss = jest.spyOn(BottomSheetModal.prototype, 'dismiss');
    await renderThemed(
      <Sheet open={false} onClose={jest.fn()}>
        <Text>Body</Text>
      </Sheet>,
      scheme,
    );
    expect(dismiss).toHaveBeenCalled();
  });

  it('hardware back closes the sheet on Android only', async () => {
    const add = jest.spyOn(BackHandler, 'addEventListener');
    const onClose = jest.fn();
    await renderThemed(
      <Sheet open onClose={onClose}>
        <Text>Body</Text>
      </Sheet>,
      scheme,
    );
    const calls = add.mock.calls.filter(([event]) => event === 'hardwareBackPress');
    if (Platform.OS === 'android') {
      expect(calls).toHaveLength(1);
      const handler = calls[0]?.[1] as (() => boolean) | undefined;
      expect(handler?.()).toBe(true);
      expect(onClose).toHaveBeenCalled();
    } else {
      expect(calls).toHaveLength(0);
    }
  });
});
