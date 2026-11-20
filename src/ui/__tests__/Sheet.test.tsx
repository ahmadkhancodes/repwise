import { fireEvent, screen } from '@testing-library/react-native';
import { BackHandler, Platform } from 'react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeScope, type ColorScheme } from '@/theme';

import { renderThemed, SCHEMES } from '../../../test/render';
import { Sheet, SheetHost, sheetMaxHeight, snapHeight } from '../Sheet';
import { Text } from '../Text';

/** Same providers as renderThemed, so a rerender keeps the component instances. */
const themed = (ui: ReactElement, scheme: ColorScheme = 'light') => (
  <SafeAreaProvider>
    <ThemeScope scheme={scheme}>{ui}</ThemeScope>
  </SafeAreaProvider>
);

describe.each(SCHEMES)('Sheet (%s)', (scheme) => {
  afterEach(() => jest.restoreAllMocks());

  it('presents when open and shows title, content and a labelled close button', async () => {
    const onClose = jest.fn();
    await renderThemed(
      <Sheet open onClose={onClose} title="Swap exercise" testID="s">
        <Text>Alternatives</Text>
      </Sheet>,
      scheme,
    );
    expect(screen.getByRole('header', { name: 'Swap exercise' })).toBeTruthy();
    expect(screen.getByText('Alternatives')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing when closed; the scrim closes it', async () => {
    const onClose = jest.fn();
    const r = await renderThemed(
      <Sheet open={false} onClose={onClose} testID="s">
        <Text>Body</Text>
      </Sheet>,
      scheme,
    );
    expect(screen.queryByText('Body')).toBeNull();
    await r.rerender(
      themed(
        <Sheet open onClose={onClose} testID="s">
          <Text>Body</Text>
        </Sheet>,
        scheme,
      ),
    );
    expect(screen.getByText('Body')).toBeTruthy();
    // The sheet is accessibilityViewIsModal, so the scrim is hidden from screen readers (Close is not).
    await fireEvent.press(screen.getByTestId('s-scrim', { includeHiddenElements: true }));
    expect(onClose).toHaveBeenCalled();
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

describe('sheet swap and host', () => {
  const two = (a: boolean) => (
    <>
      <Sheet open={a} onClose={jest.fn()}>
        <Text>Menu</Text>
      </Sheet>
      <Sheet open={!a} onClose={jest.fn()}>
        <Text>Discard</Text>
      </Sheet>
    </>
  );

  it('swaps sheets in one render (menu → discard)', async () => {
    const r = await renderThemed(two(true));
    expect(screen.getByText('Menu')).toBeTruthy();
    expect(screen.queryByText('Discard')).toBeNull();
    await r.rerender(themed(two(false)));
    expect(screen.queryByText('Menu')).toBeNull();
    expect(screen.getByText('Discard')).toBeTruthy();
  });

  it('with a SheetHost mounted, open sheets render in the host', async () => {
    const r = await renderThemed(
      <>
        {two(true)}
        <SheetHost />
      </>,
    );
    expect(screen.getByText('Menu')).toBeTruthy();
    await r.rerender(
      themed(
        <>
          {two(false)}
          <SheetHost />
        </>,
      ),
    );
    expect(screen.queryByText('Menu')).toBeNull();
    expect(screen.getByText('Discard')).toBeTruthy();
    await r.unmount();
  });
});

describe('snapHeight', () => {
  it('reads dp and window percentages', () => {
    expect(snapHeight(320, 800)).toBe(320);
    expect(snapHeight('50%', 800)).toBe(400);
  });
});

describe('sheetMaxHeight', () => {
  it('caps at 90% of the window minus the status bar', () => {
    expect(sheetMaxHeight(800, 40)).toBe(680);
    expect(sheetMaxHeight(0, 40)).toBe(0);
  });
});
