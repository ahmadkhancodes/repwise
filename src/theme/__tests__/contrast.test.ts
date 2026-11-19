import { AA_NORMAL, contrastRatio, relativeLuminance } from '../contrast';
import { colors, type ColorToken } from '../tokens';

/** WCAG AA for large text (≥ 24px regular / ≥ 18.66px bold) and 1.4.11 non-text (controls). */
const AA_LARGE = 3;
const NON_TEXT = 3;

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

const SURFACES: ColorToken[] = ['bg', 'surface', 'surface2'];
const cross = (fgs: ColorToken[], bgs: ColorToken[]): [ColorToken, ColorToken][] =>
  fgs.flatMap((fg) => bgs.map((bg): [ColorToken, ColorToken] => [fg, bg]));

/**
 * Normal-size text (≥ 4.5:1). Every text token on every neutral surface, plus each on-colour.
 * Rules this encodes (docs/DECISIONS.md, DS upgrade):
 *  - accentText is the only accent you may set as text, and never on surface2.
 *  - warning, accent and macro* are never text on light surfaces (graphics only, see below).
 */
const TEXT: [ColorToken, ColorToken][] = [
  ...cross(['textPrimary', 'textSecondary', 'textTertiary', 'danger'], SURFACES),
  ['textPrimary', 'accentSoft'],
  ['accentText', 'bg'],
  ['accentText', 'surface'],
  ['accentText', 'accentSoft'],
  ['onInverse', 'inverse'],
  ['accentOnInverse', 'inverse'],
  ['dangerOnInverse', 'inverse'],
  ['onAccent', 'accent'],
  ['onDanger', 'danger'],
];

/** Large text only (hero / display / title numbers): ≥ 3:1. */
const LARGE_TEXT: [ColorToken, ColorToken][] = [
  ...cross(['textPrimary', 'textSecondary', 'textTertiary', 'accentText'], SURFACES),
];

/**
 * Non-text UI that carries state (WCAG 1.4.11, ≥ 3:1): unselected control outlines, filled
 * ticks/switch thumbs against their track, macro rings, selected-day pill.
 * Excluded on purpose: border/surface2 (decorative dividers and tracks, never the only cue) and
 * accent on light bg (2.6:1) — accent fills always carry an onAccent glyph or a label.
 */
const CONTROLS: [ColorToken, ColorToken][] = [
  ...cross(['borderStrong', 'textPrimary', 'inverse'], SURFACES),
  ...cross(['macroProtein', 'macroCarb', 'macroFat'], ['bg', 'surface']),
  ['onAccent', 'accent'],
  ['borderStrong', 'accentSoft'],
];

describe.each(['light', 'dark'] as const)('WCAG contrast — %s theme', (scheme) => {
  const c = colors[scheme];
  it.each(TEXT)('text: %s on %s ≥ 4.5:1', (fg, bg) => {
    expect(contrastRatio(c[fg], c[bg])).toBeGreaterThanOrEqual(AA_NORMAL);
  });
  it.each(LARGE_TEXT)('large text: %s on %s ≥ 3:1', (fg, bg) => {
    expect(contrastRatio(c[fg], c[bg])).toBeGreaterThanOrEqual(AA_LARGE);
  });
  it.each(CONTROLS)('control: %s on %s ≥ 3:1', (fg, bg) => {
    expect(contrastRatio(c[fg], c[bg])).toBeGreaterThanOrEqual(NON_TEXT);
  });
});

describe('every colour token is a #RRGGBB value (except overlays)', () => {
  it.each(['light', 'dark'] as const)('%s', (scheme) => {
    for (const [k, v] of Object.entries(colors[scheme])) {
      if (k === 'scrim' || k === 'ripple') continue;
      expect(v).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});
