import { screen } from '@testing-library/react-native';

import { colors, typography } from '@/theme';

import { flat, renderThemed, SCHEMES } from '../../../test/render';
import { BigNumber, formatNumber } from '../BigNumber';

describe('formatNumber', () => {
  it.each([
    [0, 0, '0'],
    [999, 0, '999'],
    [1000, 0, '1,000'],
    [12450, 0, '12,450'],
    [1234567, 0, '1,234,567'],
    [72.456, 1, '72.5'],
    [-1500, 0, '-1,500'],
    [-0.04, 1, '0.0'],
    [2.5, 2, '2.50'],
  ])('%p with %p decimals → %p', (v, d, out) => {
    expect(formatNumber(v, d)).toBe(out);
  });
});

describe.each(SCHEMES)('BigNumber (%s)', (scheme) => {
  it('shows the final value, unit and label, and speaks them once', async () => {
    await renderThemed(<BigNumber value={12450} unit="kg" label="Volume" testID="n" />, scheme);
    const root = screen.getByTestId('n');
    expect(root.props.accessibilityLabel).toBe('Volume, 12,450 kg');
    const input = screen.getByTestId('n-value');
    expect(input.props.defaultValue).toBe('12,450');
    expect(input.props.editable).toBe(false);
    const style = flat(input.props.style);
    expect(style.fontSize).toBe(typography.display.fontSize);
    expect(style.fontVariant).toEqual(['tabular-nums']);
    expect(style.color).toBe(colors[scheme].textPrimary);
    expect(screen.getByText('kg')).toBeTruthy();
  });

  it('supports decimals and colour tokens without animation', async () => {
    await renderThemed(
      <BigNumber value={72.46} decimals={1} color="accentText" animate={false} testID="w" />,
      scheme,
    );
    const input = screen.getByTestId('w-value');
    expect(input.props.defaultValue).toBe('72.5');
    expect(flat(input.props.style).color).toBe(colors[scheme].accentText);
  });
});
