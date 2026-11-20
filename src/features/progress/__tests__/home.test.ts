import { colors } from '@/theme';
import { AA_NORMAL, contrastRatio } from '@/theme/contrast';

import { nearestIndex, seriesXs } from '../logic/chart';
import { isMonthLocked, recoveryTeaser, wrappedTeaser } from '../logic/home';
import { STORY_BACKGROUNDS, storyColors } from '../logic/storyColors';

describe.each(['light', 'dark'] as const)('Wrapped story colours (%s)', (scheme) => {
  it('every card text clears AA on its background', () => {
    for (let i = 0; i < STORY_BACKGROUNDS.length * 2; i++) {
      const c = storyColors(colors[scheme], i);
      expect(contrastRatio(c.fg, c.bg)).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('rotates calm colours (not one inverse slab)', () => {
    const bgs = new Set(
      Array.from({ length: 4 }, (_, i) => storyColors(colors[scheme], i).bgToken),
    );
    expect(bgs.size).toBe(4);
    expect(storyColors(colors[scheme], -1).bgToken).toBe('inverse');
  });
});

describe('progress home', () => {
  const nov = { year: 2026, month: 11 };
  it('locks months before last month for free users only', () => {
    expect(isMonthLocked(nov, nov, false)).toBe(false);
    expect(isMonthLocked({ year: 2026, month: 10 }, nov, false)).toBe(false);
    expect(isMonthLocked({ year: 2026, month: 9 }, nov, false)).toBe(true);
    expect(isMonthLocked({ year: 2025, month: 12 }, { year: 2026, month: 1 }, false)).toBe(false);
    expect(isMonthLocked({ year: 2020, month: 1 }, nov, true)).toBe(false);
  });

  it('teaser lines', () => {
    expect(wrappedTeaser({ workouts: 0, prs: [], volumeKg: 0 })).toMatch(/builds itself/);
    expect(wrappedTeaser({ workouts: 1, prs: [], volumeKg: 10 })).toBe('1 workout');
    expect(wrappedTeaser({ workouts: 12, prs: [{}, {}, {}] as never, volumeKg: 10 })).toBe(
      '12 workouts · 3 PRs',
    );
    expect(recoveryTeaser(0)).toBe('All fresh');
    expect(recoveryTeaser(1)).toBe('1 muscle worked');
    expect(recoveryTeaser(4)).toBe('4 muscles worked');
  });
});

describe('chart scrub helpers', () => {
  it('precomputes x per index and finds the nearest point', () => {
    const xs = seriesXs(
      [
        [{ x: 0, y: 0 }],
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 20, y: 0 },
        ],
      ],
      3,
    );
    expect(xs).toEqual([0, 10, 20]);
    expect(nearestIndex(xs, 12)).toBe(1);
    expect(nearestIndex(xs, 15)).toBe(1);
    expect(nearestIndex(xs, 99)).toBe(2);
    expect(nearestIndex([], 5)).toBeNull();
    expect(nearestIndex(xs, Number.NaN)).toBeNull();
  });
});
