import { screen } from '@testing-library/react-native';

import { sizes } from '@/theme';

import { flat, renderThemed, SCHEMES } from '../../../test/render';
import { clampProgress, ProgressRing } from '../ProgressRing';
import { Text } from '../Text';

describe('clampProgress', () => {
  it.each([
    [-1, 0],
    [0, 0],
    [0.42, 0.42],
    [1, 1],
    [3, 1],
    [NaN, 0],
    [Infinity, 0],
  ])('%p → %p', (input, out) => expect(clampProgress(input)).toBe(out));
});

describe.each(SCHEMES)('ProgressRing (%s)', (scheme) => {
  it('is an accessible progress bar with its percentage', async () => {
    await renderThemed(
      <ProgressRing progress={0.62} accessibilityLabel="Calories" testID="ring">
        <Text>1,240</Text>
      </ProgressRing>,
      scheme,
    );
    const ring = screen.getByRole('progressbar', { name: 'Calories' });
    expect(ring).toHaveAccessibilityValue({ min: 0, max: 100, now: 62, text: '62%' });
    expect(screen.getByTestId('skia-canvas')).toBeTruthy();
    expect(screen.getByText('1,240')).toBeTruthy();
    expect(flat(ring.props.style).width).toBe(sizes.ring);
  });

  it.each([
    [0, 0],
    [1.5, 100],
  ])('empty and over-full states (%p → %p%%)', async (p, now) => {
    await renderThemed(
      <ProgressRing progress={p} accessibilityLabel="Protein" color="macroProtein" size={64} />,
      scheme,
    );
    const ring = screen.getByRole('progressbar', { name: 'Protein' });
    expect(ring).toHaveAccessibilityValue({ now });
    expect(flat(ring.props.style).width).toBe(64);
  });
});
