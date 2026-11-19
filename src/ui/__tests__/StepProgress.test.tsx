import { screen } from '@testing-library/react-native';

import { renderThemed, SCHEMES } from '../../../test/render';
import { segmentFills, StepProgress } from '../StepProgress';

describe('segmentFills', () => {
  it('fills up to and including the current step', () => {
    expect(segmentFills(4, 1)).toEqual([1, 1, 0, 0]);
    expect(segmentFills(3, 0)).toEqual([1, 0, 0]);
    expect(segmentFills(0, 0)).toEqual([]);
  });
  it('uses clamped fractions when given', () => {
    expect(segmentFills(0, 0, [0.5, 2, -1, NaN])).toEqual([0.5, 1, 0, 0]);
  });
});

describe.each(SCHEMES)('StepProgress (%s)', (scheme) => {
  it('steps: speaks "Step x of n"', async () => {
    await renderThemed(
      <StepProgress total={6} current={2} accessibilityLabel="Quiz progress" testID="p" />,
      scheme,
    );
    const bar = screen.getByRole('progressbar', { name: 'Quiz progress' });
    expect(bar).toHaveAccessibilityValue({ min: 1, max: 6, now: 3, text: 'Step 3 of 6' });
    expect(bar.children).toHaveLength(6);
  });

  it('fractions: speaks the overall percentage', async () => {
    await renderThemed(
      <StepProgress fractions={[1, 0.5, 0]} color="accent" accessibilityLabel="Workout progress" />,
      scheme,
    );
    expect(screen.getByRole('progressbar', { name: 'Workout progress' })).toHaveAccessibilityValue({
      now: 50,
      text: '50%',
    });
  });
});
