import { fireEvent, screen } from '@testing-library/react-native';

import { renderThemed, SCHEMES } from '../../../test/render';
import { Stepper, stepValue } from '../Stepper';

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
