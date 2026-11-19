import { act, fireEvent, screen } from '@testing-library/react-native';

import { sizes } from '@/theme';

import { flat, renderThemed, SCHEMES } from '../../../test/render';
import {
  parseStepperInput,
  REPEAT_START_MS,
  repeatDelayMs,
  Stepper,
  stepDecimals,
  stepValue,
} from '../Stepper';

describe('stepValue', () => {
  it('adds and clamps', () => {
    expect(stepValue(10, 2.5, 0, 500)).toBe(12.5);
    expect(stepValue(1, -5, 0, 10)).toBe(0);
    expect(stepValue(9, 5, 0, 10)).toBe(10);
  });
  it('avoids float drift', () => {
    expect(stepValue(0.1, 0.2, 0, 1)).toBe(0.3);
  });
});

describe.each(SCHEMES)('Stepper (%s)', (scheme) => {
  it('labelled − / + buttons change the value', async () => {
    const onChange = jest.fn();
    await renderThemed(
      <Stepper label="Weight" value={60} step={2.5} unit="kg" onChange={onChange} testID="st" />,
      scheme,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Increase Weight' }));
    expect(onChange).toHaveBeenLastCalledWith(62.5);
    await fireEvent.press(screen.getByRole('button', { name: 'Decrease Weight' }));
    expect(onChange).toHaveBeenLastCalledWith(57.5);
  });

  it('is adjustable for screen readers', async () => {
    const onChange = jest.fn();
    await renderThemed(<Stepper label="Reps" value={8} onChange={onChange} />, scheme);
    const adj = screen.getByRole('adjustable', { name: 'Reps' });
    expect(adj).toHaveAccessibilityValue({ text: '8' });
    await fireEvent(adj, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange).toHaveBeenLastCalledWith(9);
  });

  it('disables the button at each bound', async () => {
    await renderThemed(
      <Stepper label="Sets" value={1} min={1} max={1} onChange={jest.fn()} />,
      scheme,
    );
    expect(screen.getByRole('button', { name: 'Decrease Sets' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Increase Sets' })).toBeDisabled();
  });
});

describe('gym stepper maths', () => {
  it('repeat delay accelerates to a floor', () => {
    expect(repeatDelayMs(0)).toBe(180);
    expect(repeatDelayMs(1)).toBeLessThan(repeatDelayMs(0));
    expect(repeatDelayMs(50)).toBe(40);
    expect(REPEAT_START_MS).toBeGreaterThanOrEqual(300);
  });
  it('stepDecimals', () => {
    expect(stepDecimals(1)).toBe(0);
    expect(stepDecimals(2.5)).toBe(1);
    expect(stepDecimals(0.25)).toBe(2);
  });
  it('parseStepperInput accepts commas, clamps, rejects junk', () => {
    expect(parseStepperInput('62,5', 0, 500, 1)).toBe(62.5);
    expect(parseStepperInput(' 80 ', 0, 500, 1)).toBe(80);
    expect(parseStepperInput('900', 0, 500, 1)).toBe(500);
    expect(parseStepperInput('8.7', 1, 20, 0)).toBe(9);
    expect(parseStepperInput('abc', 0, 10, 0)).toBeNull();
    expect(parseStepperInput('  ', 0, 10, 0)).toBeNull();
  });
});

describe.each(SCHEMES)('gym Stepper (%s)', (scheme) => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('± buttons are at least 56dp (64dp when large)', async () => {
    await renderThemed(
      <>
        <Stepper label="Weight" value={60} onChange={jest.fn()} testID="a" />
        <Stepper label="Reps" value={8} onChange={jest.fn()} size="large" testID="b" />
      </>,
      scheme,
    );
    expect(flat(screen.getByTestId('a-inc').props.style).width).toBe(sizes.hitGym);
    expect(flat(screen.getByTestId('b-dec').props.style).height).toBe(sizes.hitGymLarge);
  });

  it('hold to auto-repeat with acceleration, stops on release and at the bound', async () => {
    const onChange = jest.fn();
    await renderThemed(
      <Stepper label="Weight" value={60} step={2.5} max={70} onChange={onChange} testID="w" />,
      scheme,
    );
    const inc = screen.getByTestId('w-inc');
    await fireEvent(inc, 'longPress');
    expect(onChange).toHaveBeenLastCalledWith(62.5);
    await act(() => jest.advanceTimersByTime(repeatDelayMs(0)));
    expect(onChange).toHaveBeenLastCalledWith(65);
    await act(() => jest.advanceTimersByTime(repeatDelayMs(1)));
    expect(onChange).toHaveBeenLastCalledWith(67.5);
    await fireEvent(inc, 'pressOut');
    await act(() => jest.advanceTimersByTime(2000));
    expect(onChange).toHaveBeenCalledTimes(3);

    onChange.mockClear();
    await fireEvent(inc, 'longPress');
    await act(() => jest.advanceTimersByTime(5000));
    expect(onChange).toHaveBeenLastCalledWith(70);
    expect(onChange).toHaveBeenCalledTimes(4);
  });

  it('tap the value to type it', async () => {
    const onChange = jest.fn();
    await renderThemed(
      <Stepper label="Weight" value={60} step={2.5} unit="kg" onChange={onChange} testID="w" />,
      scheme,
    );
    await fireEvent.press(screen.getByRole('adjustable', { name: 'Weight' }));
    const input = screen.getByTestId('w-input');
    expect(input.props.keyboardType).toBe('decimal-pad');
    await fireEvent.changeText(input, '82,5');
    await fireEvent(input, 'submitEditing');
    expect(onChange).toHaveBeenLastCalledWith(82.5);
    expect(screen.queryByTestId('w-input')).toBeNull();
  });
});
