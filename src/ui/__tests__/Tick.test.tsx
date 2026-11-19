import { fireEvent, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { colors, sizes, themes } from '@/theme';

import { flat, renderThemed, SCHEMES } from '../../../test/render';
import { Checkbox, Tick, TickMark, tickMetrics } from '../Tick';

const successCalled = () =>
  Platform.OS === 'android'
    ? expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledWith('confirm')
    : expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');

describe('tickMetrics', () => {
  it('default is a 48dp target; gym is 56dp with slop to 64dp', () => {
    const t = themes.light;
    expect(tickMetrics('default', t).hit).toBe(sizes.touch);
    const gym = tickMetrics('gym', t);
    expect(gym.hit).toBe(sizes.hitGym);
    expect(gym.hit + gym.slop * 2).toBe(sizes.hitGymLarge);
    expect(gym.mark).toBeLessThan(gym.hit);
  });
});

describe.each(SCHEMES)('Tick (%s)', (scheme) => {
  beforeEach(() => jest.clearAllMocks());

  it('ticks with a success haptic on commit, not on press-in', async () => {
    const onChange = jest.fn();
    await renderThemed(
      <Tick checked={false} onChange={onChange} accessibilityLabel="Set 1 done" size="gym" />,
      scheme,
    );
    const box = screen.getByRole('checkbox', { name: 'Set 1 done' });
    expect(box).not.toBeChecked();
    expect(flat(box.props.style).width).toBe(sizes.hitGym);
    await fireEvent(box, 'pressIn');
    expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    await fireEvent.press(box);
    expect(onChange).toHaveBeenCalledWith(true);
    successCalled();
  });

  it('unticking uses a selection haptic', async () => {
    const onChange = jest.fn();
    await renderThemed(
      <Tick checked onChange={onChange} accessibilityLabel="Lunch eaten" />,
      scheme,
    );
    const box = screen.getByRole('checkbox', { name: 'Lunch eaten' });
    expect(box).toBeChecked();
    await fireEvent.press(box);
    expect(onChange).toHaveBeenCalledWith(false);
    if (Platform.OS === 'android')
      expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledWith('segment-tick');
    else expect(Haptics.selectionAsync).toHaveBeenCalled();
  });

  it('unchecked outline uses borderStrong; checked fills accent', async () => {
    await renderThemed(
      <>
        <TickMark checked={false} testID="off" />
        <TickMark checked testID="on" />
      </>,
      scheme,
    );
    const off = flat(screen.getByTestId('off', { includeHiddenElements: true }).props.style);
    const on = flat(screen.getByTestId('on', { includeHiddenElements: true }).props.style);
    expect(off.borderColor).toBe(colors[scheme].borderStrong);
    expect(off.borderWidth).toBe(sizes.borderThick);
    expect(on.backgroundColor).toBe(colors[scheme].accent);
  });
});

describe.each(SCHEMES)('Checkbox (%s)', (scheme) => {
  it('whole row toggles and speaks the description', async () => {
    const onChange = jest.fn();
    await renderThemed(
      <Checkbox checked={false} onChange={onChange} label="Oats" description="2 × 500 g" />,
      scheme,
    );
    const row = screen.getByRole('checkbox', { name: 'Oats, 2 × 500 g' });
    expect(flat(row.props.style).minHeight).toBe(sizes.row);
    await fireEvent.press(row);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('radio does nothing when already selected', async () => {
    const onChange = jest.fn();
    await renderThemed(
      <Checkbox role="radio" checked onChange={onChange} label="Yearly" />,
      scheme,
    );
    await fireEvent.press(screen.getByRole('radio', { name: 'Yearly' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('strikes the label when checked', async () => {
    await renderThemed(
      <Checkbox checked onChange={jest.fn()} label="Eggs" strikeWhenChecked />,
      scheme,
    );
    expect(flat(screen.getByText('Eggs').props.style).textDecorationLine).toBe('line-through');
  });
});
