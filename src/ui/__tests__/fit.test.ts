import { sizes, spacing, typography } from '@/theme';

import { estimateTextWidth, fitFontSize, ringInnerWidth } from '../fit';

describe('estimateTextWidth', () => {
  it('counts digits wider than separators', () => {
    expect(estimateTextWidth('1,850', 10)).toBeCloseTo(4 * 6.4 + 3.2);
    expect(estimateTextWidth('1:30', 10)).toBeLessThan(estimateTextWidth('1830', 10));
  });
  it('adds letter spacing between glyphs only', () => {
    expect(estimateTextWidth('88', 10, -1)).toBeCloseTo(12.8 - 1);
    expect(estimateTextWidth('', 10, 5)).toBe(0);
  });
});

describe('fitFontSize', () => {
  const base = { fontSize: 40, maxMultiplier: 1.3 };

  it('keeps the scaled size when it fits', () => {
    expect(fitFontSize({ ...base, text: '42', maxWidth: 200, fontScale: 1.3 })).toBeCloseTo(52);
  });

  it('caps scaling at the token multiplier', () => {
    expect(fitFontSize({ ...base, text: '4', maxWidth: 999, fontScale: 2 })).toBeCloseTo(52);
  });

  it('shrinks to the box so it never overflows', () => {
    const size = fitFontSize({ ...base, text: '12,450', maxWidth: 120, fontScale: 1.3 });
    expect(size).toBeLessThan(52);
    expect(estimateTextWidth('12,450', size)).toBeLessThanOrEqual(120);
  });

  it('never goes below minScale of the token size', () => {
    expect(fitFontSize({ ...base, text: '123,456,789', maxWidth: 20, minScale: 0.5 })).toBe(20);
  });

  it('handles empty text and zero width', () => {
    expect(fitFontSize({ ...base, text: '', maxWidth: 100 })).toBe(40);
    expect(fitFontSize({ ...base, text: '12', maxWidth: 0 })).toBe(40);
  });

  // Audit U9 cases at 130% font: none may overflow its ring.
  it.each([
    ['1,850', sizes.ring + spacing.xl, typography.display],
    ['2,000', sizes.ring + spacing.xxl, typography.display],
    ['1:30', sizes.ringHero, typography.hero],
    ['10:00', sizes.ringHero, typography.hero],
  ])('%s fits a %pdp ring at 130%%', (text, ring, type) => {
    const box = ringInnerWidth(ring, sizes.ringStroke);
    const size = fitFontSize({
      text,
      maxWidth: box,
      fontSize: type.fontSize,
      fontScale: 1.3,
      maxMultiplier: type.maxFontSizeMultiplier,
      letterSpacing: type.letterSpacing,
    });
    expect(
      estimateTextWidth(text, size, (type.letterSpacing ?? 0) * (size / type.fontSize)),
    ).toBeLessThanOrEqual(box);
  });
});

describe('ringInnerWidth', () => {
  it('removes both strokes and padding', () => {
    expect(ringInnerWidth(120, 10, 8)).toBe(84);
    expect(ringInnerWidth(10, 10)).toBe(0);
  });
});

describe('gym and hero tokens', () => {
  it('gym targets are 56 and 64dp; hero is a tight tabular display step', () => {
    expect(sizes.hitGym).toBe(56);
    expect(sizes.hitGymLarge).toBe(64);
    expect(typography.hero.fontSize).toBeGreaterThanOrEqual(56);
    expect(typography.hero.fontSize).toBeLessThanOrEqual(72);
    expect(typography.hero.tabular).toBe(true);
    expect(typography.hero.letterSpacing).toBeLessThan(0);
  });
});
