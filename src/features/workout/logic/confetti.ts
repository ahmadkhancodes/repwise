/**
 * Deterministic confetti layout for the PR moment (W3). Seeded so tests (and screenshots)
 * are stable; motion is done by Reanimated in components/Confetti.tsx.
 */
export type Particle = {
  /** Horizontal start offset from centre, −1 … 1 (× half the width). */
  x: number;
  /** Horizontal drift, −1 … 1. */
  drift: number;
  /** Fall distance as a fraction of the height (0.5 … 1). */
  fall: number;
  rotate: number;
  delay: number;
  size: number;
  colorIndex: number;
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function confettiParticles(count: number, colors: number, seed = 7): Particle[] {
  const r = mulberry32(seed);
  return Array.from({ length: count }, (_, i) => ({
    x: r() * 2 - 1,
    drift: r() * 2 - 1,
    fall: 0.5 + r() * 0.5,
    rotate: Math.round(r() * 720 - 360),
    delay: Math.round(r() * 160),
    size: 6 + Math.round(r() * 6),
    colorIndex: i % Math.max(1, colors),
  }));
}
