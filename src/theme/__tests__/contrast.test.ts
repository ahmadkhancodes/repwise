import { AA_NORMAL, contrastRatio, relativeLuminance } from '../contrast';
import { colors, type ColorToken } from '../tokens';

describe('contrast maths', () => {
  it('matches WCAG reference values', () => {
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1);
    expect(relativeLuminance('#000000')).toBeCloseTo(0);
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });
  it('is symmetric', () => {
    expect(contrastRatio('#1FB86B', '#000000')).toBeCloseTo(contrastRatio('#000000', '#1FB86B'));
  });
  it('rejects non-hex input', () => {
    expect(() => relativeLuminance('rgba(0,0,0,1)')).toThrow();
  });
});

/** Every text/background pair the design system actually renders. */
const PAIRS: [fg: ColorToken, bg: ColorToken][] = [
  ['textPrimary', 'bg'],
  ['textPrimary', 'surface'],
  ['textPrimary', 'surface2'],
  ['textPrimary', 'accentSoft'],
  ['textSecondary', 'bg'],
  ['textSecondary', 'surface'],
  ['textSecondary', 'surface2'],
  ['textTertiary', 'bg'],
  ['textTertiary', 'surface'],
  ['onInverse', 'inverse'],
  ['onAccent', 'accent'],
  ['onDanger', 'danger'],
  ['accentText', 'bg'],
  ['accentText', 'accentSoft'],
  ['danger', 'bg'],
];

describe.each(['light', 'dark'] as const)('WCAG AA text contrast — %s theme', (scheme) => {
  const c = colors[scheme];
  it.each(PAIRS)('%s on %s ≥ 4.5:1', (fg, bg) => {
    expect(contrastRatio(c[fg], c[bg])).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});
