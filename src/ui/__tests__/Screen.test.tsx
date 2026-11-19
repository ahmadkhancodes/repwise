import { fireEvent, screen } from '@testing-library/react-native';
import { Settings } from 'lucide-react-native';

import { colors, spacing } from '@/theme';

import { flat, renderThemed, SCHEMES } from '../../../test/render';
import { Button } from '../Button';
import { IconButton } from '../IconButton';
import { Screen } from '../Screen';
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
});
