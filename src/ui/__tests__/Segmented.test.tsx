import { fireEvent, screen } from '@testing-library/react-native';

import { colors } from '@/theme';

import { flat, renderThemed, SCHEMES } from '../../../test/render';
import { Segmented } from '../Segmented';

const OPTIONS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
] as const;

describe.each(SCHEMES)('Segmented (%s)', (scheme) => {
  it('renders a labelled tablist with the selected tab', async () => {
    await renderThemed(
      <Segmented
        options={OPTIONS}
        value="day"
        onChange={jest.fn()}
        accessibilityLabel="View"
        testID="seg"
      />,
      scheme,
    );
    const list = screen.getByTestId('seg');
    expect(list.props.accessibilityRole).toBe('tablist');
    expect(list.props.accessibilityLabel).toBe('View');
    expect(screen.getByRole('tab', { name: 'Day' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Week' })).not.toBeSelected();
    expect(flat(screen.getByTestId('seg').props.style).backgroundColor).toBe(
      colors[scheme].surface2,
    );
  });

  it('calls onChange for a new value only', async () => {
    const onChange = jest.fn();
    await renderThemed(
      <Segmented options={OPTIONS} value="day" onChange={onChange} accessibilityLabel="View" />,
      scheme,
    );
    await fireEvent.press(screen.getByRole('tab', { name: 'Day' }));
    expect(onChange).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('tab', { name: 'Week' }));
    expect(onChange).toHaveBeenCalledWith('week');
  });

  it('tabs keep a 48dp track', async () => {
    await renderThemed(
      <Segmented
        options={OPTIONS}
        value="week"
        onChange={jest.fn()}
        accessibilityLabel="View"
        testID="seg"
      />,
      scheme,
    );
    expect(flat(screen.getByTestId('seg').props.style).minHeight).toBeGreaterThanOrEqual(48);
  });
});
