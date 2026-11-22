import { preferAnimated } from '../planService';

jest.mock('@/services/exerciseMedia', () => ({
  v1IdForExercise: (id: string) => (id.startsWith('gif') ? 'abc1234' : null),
}));

const mk = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}` }));

describe('preferAnimated', () => {
  it('drops exercises without a GIF when enough remain', () => {
    const out = preferAnimated([...mk('gif', 40), ...mk('no', 10)]);
    expect(out).toHaveLength(40);
    expect(out.every((e) => e.id.startsWith('gif'))).toBe(true);
  });
  it('keeps the full pool when too few have a GIF', () => {
    expect(preferAnimated([...mk('gif', 5), ...mk('no', 10)])).toHaveLength(15);
  });
});
