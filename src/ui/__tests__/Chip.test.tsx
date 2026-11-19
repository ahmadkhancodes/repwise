import { fireEvent, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { colors } from '@/theme';

import { flat, renderThemed, SCHEMES } from '../../../test/render';
import { Chip } from '../Chip';

describe.each(SCHEMES)('Chip (%s)', (scheme) => {
  beforeEach(() => jest.clearAllMocks());

  it('unselected chip', async () => {
    await renderThemed(<Chip label="Dumbbells" />, scheme);
    const chip = screen.getByRole('checkbox', { name: 'Dumbbells' });
    expect(chip).not.toBeChecked();
    const style = flat(chip.props.style);
    expect(style.backgroundColor).toBe(colors[scheme].bg);
    expect(style.minHeight).toBeGreaterThanOrEqual(48);
  });

  it('selected chip uses accentSoft + accent border', async () => {
    await renderThemed(<Chip label="Barbell" selected />, scheme);
    const chip = screen.getByRole('checkbox', { name: 'Barbell' });
    expect(chip).toBeChecked();
    const style = flat(chip.props.style);
    expect(style.backgroundColor).toBe(colors[scheme].accentSoft);
    expect(style.borderColor).toBe(colors[scheme].accent);
  });

  it('toggles with a selection haptic', async () => {
    const onPress = jest.fn();
    await renderThemed(<Chip label="Cables" onPress={onPress} />, scheme);
    const chip = screen.getByRole('checkbox', { name: 'Cables' });
    await fireEvent(chip, 'pressIn');
    await fireEvent.press(chip);
    expect(onPress).toHaveBeenCalled();
    if (Platform.OS === 'android') {
      expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledWith('segment-tick');
    } else {
      expect(Haptics.selectionAsync).toHaveBeenCalled();
    }
  });

  it('disabled chip', async () => {
    await renderThemed(<Chip label="Machines" disabled />, scheme);
    expect(screen.getByRole('checkbox', { name: 'Machines' })).toBeDisabled();
  });
});
