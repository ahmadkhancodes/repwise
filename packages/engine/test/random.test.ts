import { createRng, cyrb53, hashHex } from '../src';

describe('hash + PRNG', () => {
  test('hash is stable and seed-sensitive', () => {
    expect(cyrb53('abc')).toBe(cyrb53('abc'));
    expect(cyrb53('abc')).not.toBe(cyrb53('abd'));
    expect(cyrb53('abc', 1)).not.toBe(cyrb53('abc', 2));
    expect(hashHex('x')).toMatch(/^[0-9a-f]{14}$/);
    expect(Number.isSafeInteger(cyrb53('long'.repeat(1000)))).toBe(true);
  });

  test('same seed → same sequence; different seed → different', () => {
    const a = createRng('seed');
    const b = createRng('seed');
    const c = createRng('other');
    const sa = Array.from({ length: 20 }, () => a.next());
    expect(Array.from({ length: 20 }, () => b.next())).toEqual(sa);
    expect(Array.from({ length: 20 }, () => c.next())).not.toEqual(sa);
    sa.forEach((x) => expect(x >= 0 && x < 1).toBe(true));
  });

  test('int, pick, shuffle', () => {
    const r = createRng(1);
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 4000; i++) counts[r.int(4)]! += 1;
    counts.forEach((c) => expect(c).toBeGreaterThan(800));
    expect(() => r.int(0)).toThrow();
    expect(() => r.pick([])).toThrow();
    const xs = [1, 2, 3, 4, 5, 6];
    const sh = r.shuffle(xs);
    expect([...sh].sort()).toEqual(xs);
    expect(xs).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('weighted never picks zero/negative/NaN weights', () => {
    const r = createRng('w');
    for (let i = 0; i < 500; i++) {
      const p = r.weighted(['a', 'b', 'c', 'd'], (x) => (x === 'a' ? 0 : x === 'b' ? -1 : x === 'c' ? NaN : 1));
      expect(p).toBe('d');
    }
    expect(r.weighted(['a'], () => 0)).toBeUndefined();
    expect(r.weighted([], () => 1)).toBeUndefined();
  });

  test('weighted follows weights', () => {
    const r = createRng('w2');
    let heavy = 0;
    for (let i = 0; i < 3000; i++) if (r.weighted(['x', 'y'], (v) => (v === 'x' ? 9 : 1)) === 'x') heavy++;
    expect(heavy / 3000).toBeGreaterThan(0.85);
    expect(heavy / 3000).toBeLessThan(0.95);
  });

  test('fork is stable and independent', () => {
    expect(createRng('s').fork('a').next()).toBe(createRng('s').fork('a').next());
    expect(createRng('s').fork('a').next()).not.toBe(createRng('s').fork('b').next());
  });
});
