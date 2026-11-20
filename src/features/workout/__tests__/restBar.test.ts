import { estimateTextWidth } from '@/ui';
import { themes } from '@/theme';

import { restBarTimeBox, restBarTimeSize } from '../components/RestTimer';

const t = themes.light;
const hero = t.typography.hero;

describe('rest bar countdown size (perf N21, 360dp / 130% font)', () => {
  const box = restBarTimeBox(360, t);

  it('leaves room for the two 56dp controls on a 360dp phone', () => {
    expect(box).toBe(360 - 40 - 24 - 112 - 24);
  });

  it.each([1, 1.3, 2])('"1:30" is hero size and fits at %px font', (scale) => {
    const size = restBarTimeSize('1:30', box, scale, t);
    expect(size).toBeGreaterThanOrEqual(hero.fontSize * 0.95);
    expect(estimateTextWidth('0:00', size, (hero.letterSpacing ?? 0) * (size / hero.fontSize))).toBeLessThanOrEqual(box);
  });

  it('"10:00" shrinks just enough to fit, never below display size', () => {
    const size = restBarTimeSize('10:00', box, 1.3, t);
    expect(size).toBeLessThan(hero.fontSize);
    expect(size).toBeGreaterThanOrEqual(t.typography.display.fontSize);
    expect(estimateTextWidth('00:00', size, (hero.letterSpacing ?? 0) * (size / hero.fontSize))).toBeLessThanOrEqual(box);
  });

  it('digits do not change size as they tick (sized on the widest digit)', () => {
    expect(restBarTimeSize('1:11', box, 1, t)).toBe(restBarTimeSize('1:00', box, 1, t));
  });
});
