import { fireEvent, screen, within } from '@testing-library/react-native';
import { Settings } from 'lucide-react-native';
import { FlatList } from 'react-native';

import { colors, spacing } from '@/theme';

import { flat, renderThemed, SCHEMES } from '../../../test/render';
import { Button } from '../Button';
import { IconButton } from '../IconButton';
import { Screen, SCREEN_KEYBOARD_BEHAVIOR } from '../Screen';
import { Text } from '../Text';
import { useToastStore } from '../Toast';

describe.each(SCHEMES)('Screen (%s)', (scheme) => {
  it('themed background, large header title, content', async () => {
    await renderThemed(
      <Screen title="Today" testID="scr">
        <Text>Body</Text>
      </Screen>,
      scheme,
    );
    expect(flat(screen.getByTestId('scr').props.style).backgroundColor).toBe(colors[scheme].bg);
    expect(screen.getByRole('header', { name: 'Today' })).toBeTruthy();
    expect(screen.getByText('Body')).toBeTruthy();
  });

  it('pins the footer and renders header actions', async () => {
    await renderThemed(
      <Screen
        title="Paywall"
        headerRight={<IconButton icon={Settings} accessibilityLabel="Settings" />}
        footer={<Button label="Start trial" accent />}
      >
        <Text>Plans</Text>
      </Screen>,
      scheme,
    );
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start trial' })).toBeTruthy();
  });

  it('fixed (non-scroll) layout uses screen padding', async () => {
    await renderThemed(
      <Screen scroll={false} testID="fixed">
        <Text>Fixed</Text>
      </Screen>,
      scheme,
    );
    expect(flat(screen.getByTestId('fixed-content').props.style).paddingHorizontal).toBe(
      spacing.screen,
    );
  });

  it('registers its pinned footer height so toasts sit above it', async () => {
    useToastStore.setState({ footers: [] });
    const { unmount } = await renderThemed(
      <Screen title="Player" footer={<Button label="Log set" />} testID="pl">
        <Text>Sets</Text>
      </Screen>,
      scheme,
    );
    await fireEvent(screen.getByTestId('pl-footer'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 112 } },
    });
    expect(useToastStore.getState().footers.map(([, h]) => h)).toEqual([112]);
    await unmount();
    expect(useToastStore.getState().footers).toEqual([]);
  });

  it('keyboard screens avoid the keyboard with one behaviour on both platforms', async () => {
    await renderThemed(
      <Screen title="Log body" keyboard footer={<Button label="Save" />} testID="kb">
        <Text>Form</Text>
      </Screen>,
      scheme,
    );
    expect(SCREEN_KEYBOARD_BEHAVIOR).toBe('padding');
    // The pinned footer rides inside the avoiding view, so Save stays above the keyboard.
    expect(
      within(screen.getByTestId('kb-keyboard')).getByRole('button', { name: 'Save' }),
    ).toBeTruthy();
  });

  it('screens without inputs render no keyboard wrapper', async () => {
    await renderThemed(
      <Screen title="Today" testID="nokb">
        <Text>Body</Text>
      </Screen>,
      scheme,
    );
    expect(screen.queryByTestId('nokb-keyboard')).toBeNull();
  });

  it('list mode hands the large title and scroll wiring to a virtualised list', async () => {
    const seen: { throttle?: number; hasTitle?: boolean } = {};
    await renderThemed(
      <Screen
        title="History"
        testID="ls"
        list={(p) => {
          seen.throttle = p.scrollEventThrottle;
          seen.hasTitle = p.largeTitle !== null;
          return (
            <FlatList
              data={['a', 'b']}
              keyExtractor={(x) => x}
              ListHeaderComponent={p.largeTitle ?? undefined}
              contentContainerStyle={p.contentContainerStyle}
              renderItem={({ item }) => <Text>Row {item}</Text>}
            />
          );
        }}
      />,
      scheme,
    );
    expect(seen).toEqual({ throttle: 16, hasTitle: true });
    expect(screen.getByRole('header', { name: 'History' })).toBeTruthy();
    expect(screen.getByText('Row b')).toBeTruthy();
    expect(screen.getByTestId('ls-list')).toBeTruthy();
  });
});
