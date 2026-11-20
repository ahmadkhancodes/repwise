import { motion } from '@/theme';

import { enterAt, exitFade, layoutSpring, STAGGER_CAP, staggerDelay } from '../listMotion';

describe('listMotion', () => {
  it('staggers 20 ms per row, capped at one screenful', () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(1)).toBe(motion.listStagger);
    expect(staggerDelay(3)).toBe(3 * motion.listStagger);
    expect(staggerDelay(100)).toBe(STAGGER_CAP * motion.listStagger);
    expect(staggerDelay(-2)).toBe(0);
    expect(staggerDelay(Number.NaN)).toBe(0);
  });

  it('nothing moves under Reduce Motion', () => {
    expect(enterAt(2, true)).toBeUndefined();
    expect(exitFade(true)).toBeUndefined();
    expect(layoutSpring(true)).toBeUndefined();
    expect(enterAt(2, false)).toBeDefined();
    expect(exitFade(false)).toBeDefined();
    expect(layoutSpring(false)).toBeDefined();
  });
});
