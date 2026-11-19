import { screen } from '@testing-library/react-native';

import { colors, radius } from '@/theme';

import { flat, renderThemed, SCHEMES } from '../../../test/render';
import { Skeleton, SkeletonCard, SkeletonGroup, SkeletonText } from '../Skeleton';

describe.each(SCHEMES)('Skeleton (%s)', (scheme) => {
  it('is a themed block hidden from screen readers', async () => {
    await renderThemed(<Skeleton height={24} width="50%" testID="sk" />, scheme);
    const el = screen.getByTestId('sk', { includeHiddenElements: true });
    const style = flat(el.props.style);
    expect(style.height).toBe(24);
    expect(style.width).toBe('50%');
    expect(style.borderRadius).toBe(radius.button);
    expect(style.backgroundColor).toBe(colors[scheme].surface2);
    expect(el.props.accessibilityElementsHidden).toBe(true);
    expect(el.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('SkeletonText draws one bar per line, the last one shorter', async () => {
    await renderThemed(<SkeletonText lines={3} testID="txt" />, scheme);
    const bars = screen.getByTestId('txt', { includeHiddenElements: true }).children;
    expect(bars).toHaveLength(3);
  });

  it('SkeletonGroup announces one busy "Loading" label', async () => {
    await renderThemed(
      <SkeletonGroup label="Loading meals" testID="grp">
        <SkeletonCard media lines={2} />
        <SkeletonCard bodyHeight={120} />
      </SkeletonGroup>,
      scheme,
    );
    const grp = screen.getByLabelText('Loading meals');
    expect(grp).toBeBusy();
    expect(grp.props.accessible).toBe(true);
  });
});
