import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { fireEvent, screen } from '@testing-library/react-native';
import { BackHandler, Platform } from 'react-native';

import { renderThemed, SCHEMES } from '../../../test/render';
import { Sheet, sheetMaxHeight } from '../Sheet';
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

  it('scrollable: pinned header, scrolling body and a pinned footer', async () => {
    await renderThemed(
      <Sheet
        open
        onClose={jest.fn()}
        title="Ingredients"
        scrollable
        footer={<Text>Show 24</Text>}
        testID="ing"
      >
        {Array.from({ length: 20 }, (_, i) => (
          <Text key={i}>Item {i}</Text>
        ))}
      </Sheet>,
      scheme,
    );
    expect(screen.getByTestId('ing')).toBeTruthy();
    expect(screen.getByTestId('ing-scroll')).toBeTruthy();
    expect(screen.getByText('Item 19')).toBeTruthy();
    expect(screen.getByTestId('ing-footer')).toBeTruthy();
    expect(screen.getByText('Show 24')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Ingredients' })).toBeTruthy();
  });

  it('content sheets expose their testID for tests and Maestro', async () => {
    await renderThemed(
      <Sheet open onClose={jest.fn()} testID="plain">
        <Text>Body</Text>
      </Sheet>,
      scheme,
    );
    expect(screen.getByTestId('plain')).toBeTruthy();
    expect(screen.queryByTestId('plain-scroll')).toBeNull();
  });
});

describe('sheetMaxHeight', () => {
  it('caps at 90% of the window minus the status bar', () => {
    expect(sheetMaxHeight(800, 40)).toBe(680);
    expect(sheetMaxHeight(0, 40)).toBe(0);
  });
});
