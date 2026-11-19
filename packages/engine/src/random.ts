/**
 * Deterministic hashing + seeded PRNG. Same seed → same plan, on device and in the Worker.
 * No Math.random(), no crypto APIs (not guaranteed on Hermes).
 */

/** cyrb53: fast, well-distributed 53-bit string hash. */
export function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Hash to a fixed-width lowercase hex string (14 chars). */
export function hashHex(str: string): string {
  return cyrb53(str).toString(16).padStart(14, '0');
}

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
  /** Weighted pick; items with weight ≤ 0 are never chosen. Returns undefined if none eligible. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T | undefined;
  /** Derive an independent child stream (stable for a given label). */
  fork(label: string): Rng;
}

function mulberry32(a: number): () => number {
  let s = a >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: string | number): Rng {
  const seedStr = String(seed);
  const gen = mulberry32(cyrb53(seedStr) % 4294967296);
  const rng: Rng = {
    next: gen,
    int(n: number) {
      if (n <= 0) throw new RangeError('int(n) requires n > 0');
      return Math.floor(gen() * n);
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new RangeError('pick from empty list');
      return items[rng.int(items.length)] as T;
    },
    shuffle<T>(items: readonly T[]): T[] {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        const tmp = out[i] as T;
        out[i] = out[j] as T;
        out[j] = tmp;
      }
      return out;
    },
    weighted<T>(items: readonly T[], weight: (item: T) => number): T | undefined {
      let total = 0;
      const ws = items.map((it) => {
        const w = weight(it);
        const safe = Number.isFinite(w) && w > 0 ? w : 0;
        total += safe;
        return safe;
      });
      if (total <= 0) return undefined;
      let r = gen() * total;
      for (let i = 0; i < items.length; i++) {
        r -= ws[i] as number;
        if (r < 0 && (ws[i] as number) > 0) return items[i];
      }
      // Floating-point edge: return last eligible.
      for (let i = items.length - 1; i >= 0; i--) if ((ws[i] as number) > 0) return items[i];
      return undefined;
    },
    fork(label: string): Rng {
      return createRng(`${seedStr}/${label}`);
    },
  };
  return rng;
}
