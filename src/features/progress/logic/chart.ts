/**
 * Chart geometry (pure): nice axis ticks, linear scales and SVG path strings that the Skia
 * charts draw. Tested against fixtures so what you see is exactly the data.
 */

export type Pt = { x: number; y: number };

/** 1, 2, 2.5 or 5 × 10^n step that gives about `count` ticks. */
export function niceStep(span: number, count: number): number {
  if (!(span > 0) || count < 1) return 1;
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * pow;
}

const clean = (v: number) => Math.round(v * 1e6) / 1e6;

/** Domain rounded out to nice steps, with ticks. A flat series gets a small band around it. */
export function niceDomain(
  values: readonly number[],
  count = 4,
  opts: { zero?: boolean } = {},
): { min: number; max: number; ticks: number[] } {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return { min: 0, max: 1, ticks: [0, 1] };
  let lo = Math.min(...finite);
  let hi = Math.max(...finite);
  if (opts.zero) lo = Math.min(0, lo);
  if (hi === lo) {
    const pad = Math.abs(hi) * 0.05 || 1;
    hi += pad;
    lo = opts.zero ? lo : lo - pad;
  }
  const step = niceStep(hi - lo, count);
  const min = clean(Math.floor(lo / step + 1e-9) * step);
  const max = clean(Math.ceil(hi / step - 1e-9) * step);
  const ticks: number[] = [];
  for (let i = 0; min + i * step <= max + step / 2; i++) ticks.push(clean(min + i * step));
  return { min, max, ticks };
}

/** Linear map from [d0, d1] to [r0, r1]; a zero-width domain maps to the middle. */
export function scaleLinear(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  if (d1 === d0) return () => (r0 + r1) / 2;
  const k = (r1 - r0) / (d1 - d0);
  return (v) => r0 + (v - d0) * k;
}

const f2 = (n: number) => Math.round(n * 100) / 100;

/** "M x y L x y …" through the points (empty string for no points). */
export function linePath(points: readonly Pt[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${f2(p.x)} ${f2(p.y)}`).join(' ');
}

/** Closed area under a line down to `baseY` (for the soft fill under the trend). */
export function areaPath(points: readonly Pt[], baseY: number): string {
  if (points.length === 0) return '';
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return `${linePath(points)} L${f2(last.x)} ${f2(baseY)} L${f2(first.x)} ${f2(baseY)} Z`;
}

export type Frame = {
  width: number;
  height: number;
  padTop: number;
  padBottom: number;
  padLeft: number;
  padRight: number;
};

export type LineLayout = {
  domain: { min: number; max: number; ticks: number[] };
  /** Pixel positions per series, same order as input. */
  series: Pt[][];
  ticksY: { value: number; y: number }[];
};

/**
 * Lay out one or more series that share an x index (0..n−1, evenly spaced, oldest left).
 * y grows downward in pixels.
 */
export function layoutLines(
  series: readonly (readonly number[])[],
  frame: Frame,
  tickCount = 4,
): LineLayout {
  const all = series.flat();
  const domain = niceDomain(all, tickCount);
  const n = Math.max(0, ...series.map((s) => s.length));
  const x = scaleLinear(0, Math.max(1, n - 1), frame.padLeft, frame.width - frame.padRight);
  const y = scaleLinear(domain.min, domain.max, frame.height - frame.padBottom, frame.padTop);
  const xs = (i: number) => (n === 1 ? (frame.padLeft + frame.width - frame.padRight) / 2 : x(i));
  return {
    domain,
    series: series.map((s) => s.map((v, i) => ({ x: xs(i), y: y(v) }))),
    ticksY: domain.ticks.map((value) => ({ value, y: y(value) })),
  };
}

export type Bar = { x: number; y: number; width: number; height: number; value: number };

/** Evenly spaced bars from a zero baseline; optional target values share the scale. */
export function layoutBars(
  values: readonly number[],
  frame: Frame,
  opts: { gap?: number; targets?: readonly (number | null)[]; tickCount?: number } = {},
): {
  bars: Bar[];
  domain: { min: number; max: number; ticks: number[] };
  targetYs: (number | null)[];
  ticksY: { value: number; y: number }[];
} {
  const targets = opts.targets ?? [];
  const domain = niceDomain(
    [0, ...values, ...targets.filter((t): t is number => t != null)],
    opts.tickCount ?? 3,
    { zero: true },
  );
  const innerW = frame.width - frame.padLeft - frame.padRight;
  const n = values.length;
  const gap = opts.gap ?? 6;
  const width = n > 0 ? Math.max(1, (innerW - gap * (n - 1)) / n) : 0;
  const y = scaleLinear(domain.min, domain.max, frame.height - frame.padBottom, frame.padTop);
  const base = y(0);
  const bars = values.map((v, i) => {
    const top = y(Math.max(0, v));
    return {
      x: frame.padLeft + i * (width + gap),
      y: top,
      width,
      height: Math.max(0, base - top),
      value: v,
    };
  });
  return {
    bars,
    domain,
    targetYs: values.map((_, i) => (targets[i] == null ? null : y(targets[i] as number))),
    ticksY: domain.ticks.map((value) => ({ value, y: y(value) })),
  };
}

/** Indices to label on the x axis: first, last and evenly spaced ones in between (max `count`). */
export function labelIndices(n: number, count = 4): number[] {
  if (n <= 0) return [];
  if (n <= count) return Array.from({ length: n }, (_, i) => i);
  const out = new Set<number>();
  for (let i = 0; i < count; i++) out.add(Math.round((i * (n - 1)) / (count - 1)));
  return [...out].sort((a, b) => a - b);
}

/** Short tick text: 82.5 → "82.5", 12000 → "12k". */
export function tickLabel(v: number): string {
  if (Math.abs(v) >= 10_000) return `${Math.round(v / 1000)}k`;
  if (Math.abs(v) >= 1000) return `${Math.round(v / 100) / 10}k`;
  return String(Math.round(v * 10) / 10);
}

/** x of each index across series (the first series long enough wins), precomputed once per layout. */
export function seriesXs(series: readonly (readonly Pt[])[], count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(series.find((s) => s.length > i)?.[i]?.x ?? 0);
  return out;
}

/** Index whose x is nearest to `x` (scrub), or null for no points. Ties go to the left. */
export function nearestIndex(xs: readonly number[], x: number): number | null {
  if (xs.length === 0 || !Number.isFinite(x)) return null;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < xs.length; i++) {
    const d = Math.abs(xs[i]! - x);
    if (d < bestD) [best, bestD] = [i, d];
  }
  return best;
}
