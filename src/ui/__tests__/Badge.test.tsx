import { screen } from '@testing-library/react-native';
import { Crown } from 'lucide-react-native';

import { colors } from '@/theme';
import { AA_NORMAL, contrastRatio } from '@/theme/contrast';

import { flat, renderThemed, SCHEMES } from '../../../test/render';
import { Badge, badgePalette, type BadgeTone } from '../Badge';

const TONES: BadgeTone[] = ['neutral', 'accent', 'inverse', 'outline', 'danger'];

describe.each(SCHEMES)('Badge (%s)', (scheme) => {
  it.each(TONES)('%s label is AA on its fill', (tone) => {
    const p = badgePalette(tone);
    const c = colors[scheme];
    expect(contrastRatio(c[p.fg], c[p.bg ?? 'bg'])).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('renders a static pill with a spoken label', async () => {
    await renderThemed(
      <Badge
        label="+150 kcal"
        tone="accent"
        icon={Crown}
        accessibilityLabel="150 calories more"
        testID="b"
      />,
      scheme,
    );
    const b = screen.getByTestId('b');
    expect(b.props.accessibilityLabel).toBe('150 calories more');
    expect(flat(b.props.style).backgroundColor).toBe(colors[scheme].accentSoft);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
