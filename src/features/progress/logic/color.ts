/** Colour maths on theme token values (never raw literals in UI code). Pure. */

function parse(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Blend token colour `a` → `b` by t (0..1). Non-hex tokens snap at the midpoint. */
export function mixColor(a: string, b: string, t: number): string {
  const k = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return k < 0.5 ? a : b;
  const c = pa.map((v, i) => Math.round(v + (pb[i]! - v) * k));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
