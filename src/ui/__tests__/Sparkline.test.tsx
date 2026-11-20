import { fireEvent, screen } from '@testing-library/react-native';

import { renderThemed, SCHEMES } from '../../../test/render';
import { Sparkline, sparkPath, sparkPoints } from '../Sparkline';

describe('sparkline geometry', () => {
  it('fills the box, highest value at the top; flat series on the middle line', () => {
    expect(sparkPoints([80, 79, 78], 100, 40, 2)).toEqual([
      { x: 2, y: 2 },
      { x: 50, y: 20 },
      { x: 98, y: 38 },
    ]);
    expect(sparkPoints([5, 5], 10, 10, 0)).toEqual([
      { x: 0, y: 5 },
      { x: 10, y: 5 },
    ]);
    expect(sparkPoints([5], 10, 10, 0)).toEqual([]);
    expect(sparkPoints([1, NaN, 3], 10, 10, 0)).toHaveLength(2);
    expect(sparkPath([{ x: 0, y: 1 }, { x: 2, y: 3 }])).toBe('M0.0 1.0 L2.0 3.0');
  });
});

describe.each(SCHEMES)('Sparkline (%s)', (scheme) => {
  it('draws at a fixed width, hidden from screen readers', async () => {
    await renderThemed(<Sparkline values={[1, 2, 3]} width={120} height={48} testID="sp" />, scheme);
    const v = screen.getByTestId('sp', { includeHiddenElements: true });
    expect(v.props.accessibilityElementsHidden).toBe(true);
    expect(screen.getByTestId('skia-canvas', { includeHiddenElements: true })).toBeTruthy();
  });

  it('fills its parent: draws once measured', async () => {
    await renderThemed(<Sparkline values={[3, 1, 2]} testID="sp" />, scheme);
    expect(screen.queryByTestId('skia-canvas', { includeHiddenElements: true })).toBeNull();
    await fireEvent(screen.getByTestId('sp', { includeHiddenElements: true }), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 200, height: 64 } },
    });
    expect(screen.getByTestId('skia-canvas', { includeHiddenElements: true })).toBeTruthy();
  });
});
