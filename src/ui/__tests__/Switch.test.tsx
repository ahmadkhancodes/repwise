import { fireEvent, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

import { colors, sizes } from '@/theme';

import { flat, renderThemed, SCHEMES } from '../../../test/render';
import { Switch } from '../Switch';

describe.each(SCHEMES)('Switch (%s)', (scheme) => {
  beforeEach(() => jest.clearAllMocks());

  it('is a labelled 48dp switch that toggles on commit', async () => {
    const onValueChange = jest.fn();
    await renderThemed(
      <Switch value={false} onValueChange={onValueChange} accessibilityLabel="Sound" testID="sw" />,
      scheme,
    );
    const sw = screen.getByRole('switch', { name: 'Sound' });
    expect(sw).not.toBeChecked();
    expect(flat(sw.props.style).minHeight).toBe(sizes.touch);
    await fireEvent(sw, 'pressIn');
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalled();
    await fireEvent.press(sw);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('off track is outlined with borderStrong (≥ 3:1)', async () => {
    await renderThemed(
      <Switch value={false} onValueChange={jest.fn()} accessibilityLabel="Vibrate" testID="sw" />,
      scheme,
    );
    const track = screen.getByTestId('sw-track', { includeHiddenElements: true });
    expect(flat(track.props.style).borderWidth).toBe(sizes.borderThick);
    expect(colors[scheme].borderStrong).toBeTruthy();
  });

  it('disabled', async () => {
    const onValueChange = jest.fn();
    await renderThemed(
      <Switch value onValueChange={onValueChange} accessibilityLabel="Sync" disabled />,
      scheme,
    );
    const sw = screen.getByRole('switch', { name: 'Sync' });
    expect(sw).toBeChecked();
    expect(sw).toBeDisabled();
  });
});
