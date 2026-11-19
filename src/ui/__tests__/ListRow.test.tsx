import { fireEvent, screen } from '@testing-library/react-native';
import { Bell } from 'lucide-react-native';

import { colors } from '@/theme';

import { flat, renderThemed, SCHEMES } from '../../../test/render';
import { ListRow } from '../ListRow';

describe.each(SCHEMES)('ListRow (%s)', (scheme) => {
  it('pressable row: one button with full label and 56 min height', async () => {
    const onPress = jest.fn();
    await renderThemed(
      <ListRow
        title="Reminders"
        subtitle="Meals and workouts"
        value="On"
        icon={Bell}
        onPress={onPress}
      />,
      scheme,
    );
    const row = screen.getByRole('button', { name: 'Reminders, Meals and workouts, On' });
    expect(flat(row.props.style).minHeight).toBeGreaterThanOrEqual(56);
    await fireEvent.press(row);
    expect(onPress).toHaveBeenCalled();
  });

  it('static row is not a button', async () => {
    await renderThemed(<ListRow title="Version" value="1.0.0" testID="r" />, scheme);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByTestId('r').props.accessibilityLabel).toBe('Version, 1.0.0');
  });

  it('destructive row uses the danger token', async () => {
    await renderThemed(<ListRow title="Delete account" destructive onPress={jest.fn()} />, scheme);
    expect(flat(screen.getByText('Delete account').props.style).color).toBe(colors[scheme].danger);
  });

  it('disabled row does not fire', async () => {
    const onPress = jest.fn();
    await renderThemed(<ListRow title="Sync now" disabled onPress={onPress} />, scheme);
    const row = screen.getByRole('button', { name: 'Sync now' });
    expect(row).toBeDisabled();
    await fireEvent.press(row);
    expect(onPress).not.toHaveBeenCalled();
  });
});
