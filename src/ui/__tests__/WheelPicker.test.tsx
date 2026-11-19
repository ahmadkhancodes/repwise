import { fireEvent, screen } from '@testing-library/react-native';
import { Dimensions, Platform } from 'react-native';

import { sizes } from '@/theme';

import { renderThemed, SCHEMES } from '../../../test/render';
import { indexAtOffset, WheelPicker, wheelRowHeight } from '../WheelPicker';

const ITEMS = Array.from({ length: 20 }, (_, i) => ({ value: i + 1, label: String(i + 1) }));

/** Row height for the test window's font scale (the RN jest mock reports one). */
const rowHeight = () => wheelRowHeight(sizes.wheelRow, Dimensions.get('window').fontScale);

describe('wheel maths', () => {
  it('indexAtOffset snaps and clamps', () => {
    expect(indexAtOffset(0, 44, 20)).toBe(0);
    expect(indexAtOffset(65, 44, 20)).toBe(1);
    expect(indexAtOffset(67, 44, 20)).toBe(2);
    expect(indexAtOffset(-100, 44, 20)).toBe(0);
    expect(indexAtOffset(99999, 44, 20)).toBe(19);
    expect(indexAtOffset(10, 44, 0)).toBe(0);
  });
  it('row height grows at 130% font scale', () => {
    expect(wheelRowHeight(44, 1)).toBe(44);
    expect(wheelRowHeight(44, 1.3)).toBe(57);
    expect(wheelRowHeight(44, 0.8)).toBe(44);
    expect(wheelRowHeight(44, 3)).toBe(88);
  });
});

describe.each(SCHEMES)('WheelPicker (%s)', (scheme) => {
  it('is one adjustable control announcing the current label', async () => {
    await renderThemed(
      <WheelPicker items={ITEMS} value={8} onChange={jest.fn()} accessibilityLabel="Reps" />,
      scheme,
    );
    const wheel = screen.getByRole('adjustable', { name: 'Reps' });
    expect(wheel).toHaveAccessibilityValue({ text: '8' });
  });

  it('increment / decrement actions move one row', async () => {
    const onChange = jest.fn();
    await renderThemed(
      <WheelPicker items={ITEMS} value={8} onChange={onChange} accessibilityLabel="Reps" />,
      scheme,
    );
    const wheel = screen.getByRole('adjustable', { name: 'Reps' });
    await fireEvent(wheel, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange).toHaveBeenLastCalledWith(9);
    await fireEvent(wheel, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onChange).toHaveBeenLastCalledWith(7);
  });

  it('settles on the snapped row after momentum', async () => {
    const onChange = jest.fn();
    await renderThemed(
      <WheelPicker
        items={ITEMS}
        value={1}
        onChange={onChange}
        accessibilityLabel="Reps"
        testID="wp"
      />,
      scheme,
    );
    const scroll = screen.getByTestId('wp-scroll', { includeHiddenElements: true });
    await fireEvent(scroll, 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 0, y: rowHeight() * 4 } },
    });
    expect(onChange).toHaveBeenLastCalledWith(5);
  });

  it('platform tuning: no overscroll glow + nested scroll on Android', async () => {
    await renderThemed(
      <WheelPicker
        items={ITEMS}
        value={1}
        onChange={jest.fn()}
        accessibilityLabel="Reps"
        testID="wp"
      />,
      scheme,
    );
    const scroll = screen.getByTestId('wp-scroll', { includeHiddenElements: true });
    if (Platform.OS === 'android') {
      expect(scroll.props.overScrollMode).toBe('never');
      expect(scroll.props.nestedScrollEnabled).toBe(true);
    } else {
      expect(scroll.props.overScrollMode).toBeUndefined();
      expect(scroll.props.nestedScrollEnabled).toBe(false);
    }
  });
});
