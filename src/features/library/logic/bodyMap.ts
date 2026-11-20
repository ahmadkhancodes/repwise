/**
 * Body diagram geometry for the muscle map (S19 wow moment; reused by the S32 heatmap).
 * Pure data: SVG path strings in a 100 × 212 box per view (front / back), drawn by Skia.
 * Shapes are smooth closed curves through a few landmark points; the left side is authored and
 * mirrored, so both sides always match.
 */
import type { Muscle } from '@repwise/content';

export const VIEW_W = 100;
export const VIEW_H = 212;

export type BodyView = 'front' | 'back';
export type Pt = readonly [number, number];

const r1 = (n: number) => Math.round(n * 100) / 100;

/** Smooth closed curve through the midpoints of the polygon edges (quadratic Béziers). */
export function blob(points: readonly Pt[]): string {
  const n = points.length;
  if (n < 3) throw new RangeError('blob needs at least 3 points');
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = mid(points[n - 1]!, points[0]!);
  let d = `M${r1(start[0])} ${r1(start[1])}`;
  for (let i = 0; i < n; i++) {
    const p = points[i]!;
    const m = mid(p, points[(i + 1) % n]!);
    d += ` Q${r1(p[0])} ${r1(p[1])} ${r1(m[0])} ${r1(m[1])}`;
  }
  return `${d} Z`;
}

export function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  return (
    `M${r1(cx - rx)} ${r1(cy)} A${rx} ${ry} 0 1 0 ${r1(cx + rx)} ${r1(cy)} ` +
    `A${rx} ${ry} 0 1 0 ${r1(cx - rx)} ${r1(cy)} Z`
  );
}

export function mirror(points: readonly Pt[]): Pt[] {
  return points.map(([x, y]) => [VIEW_W - x, y] as const);
}

/** A muscle region: its SVG path (drawn) and the polygon it was built from (hit-testing, framing). */
export type RegionShape = { d: string; points: readonly Pt[] };
const shape = (points: readonly Pt[]): RegionShape => ({ d: blob(points), points });

/** Left-side shape and its mirror. */
const pair = (points: readonly Pt[]): RegionShape[] => [shape(points), shape(mirror(points))];
const pairD = (points: readonly Pt[]): string[] => pair(points).map((r) => r.d);

// ---------------------------------------------------------------------------
// Silhouette (same outline for front and back)
// ---------------------------------------------------------------------------

const UPPER_ARM: Pt[] = [
  [28, 32],
  [20, 37],
  [16, 58],
  [18, 72],
  [25, 71],
  [28, 50],
];
const FOREARM: Pt[] = [
  [18, 71],
  [25, 70],
  [24, 90],
  [17, 108],
  [11, 106],
  [12, 88],
];
const THIGH: Pt[] = [
  [32, 93],
  [50, 96],
  [48, 128],
  [45, 152],
  [36, 152],
  [31, 124],
];
const SHIN: Pt[] = [
  [35, 150],
  [46, 150],
  [46, 174],
  [43, 200],
  [37, 200],
  [34, 174],
];

export const BODY_OUTLINE: string[] = [
  ellipse(50, 13, 8.5, 10.5),
  blob([
    [44, 20],
    [56, 20],
    [57, 30],
    [43, 30],
  ]),
  blob([
    [30, 30],
    [70, 30],
    [74, 40],
    [68, 62],
    [66, 80],
    [69, 98],
    [31, 98],
    [34, 80],
    [32, 62],
    [26, 40],
  ]),
  ...pairD(UPPER_ARM),
  ...pairD(FOREARM),
  ellipse(13, 112, 4, 6),
  ellipse(87, 112, 4, 6),
  ...pairD(THIGH),
  ...pairD(SHIN),
  ellipse(40, 204, 6, 3.5),
  ellipse(60, 204, 6, 3.5),
];

// ---------------------------------------------------------------------------
// Muscle regions
// ---------------------------------------------------------------------------

const SIDE_DELT: Pt[] = [
  [23, 35],
  [28, 33],
  [26, 47],
  [20, 45],
];
const FOREARM_MUSCLE: Pt[] = [
  [18, 73],
  [24, 72],
  [22, 90],
  [16, 100],
  [14, 90],
];

export const MUSCLE_SHAPES: Record<BodyView, Partial<Record<Muscle, RegionShape[]>>> = {
  front: {
    traps: pair([
      [43, 27],
      [46, 30],
      [38, 33],
      [32, 32],
    ]),
    front_delts: pair([
      [29, 33],
      [36, 34],
      [34, 45],
      [27, 46],
      [25, 39],
    ]),
    side_delts: pair(SIDE_DELT),
    chest: pair([
      [37, 36],
      [49, 37],
      [49, 51],
      [40, 54],
      [32, 49],
      [31, 41],
    ]),
    biceps: pair([
      [21, 48],
      [27, 47],
      [27, 60],
      [23, 67],
      [19, 60],
    ]),
    forearms: pair(FOREARM_MUSCLE),
    abs: [
      shape([
        [44, 55],
        [56, 55],
        [57, 79],
        [50, 87],
        [43, 79],
      ]),
    ],
    obliques: pair([
      [34, 56],
      [41, 57],
      [41, 78],
      [36, 81],
      [33, 67],
    ]),
    hip_flexors: pair([
      [37, 85],
      [45, 88],
      [47, 96],
      [40, 96],
    ]),
    abductors: pair([
      [31, 93],
      [35, 93],
      [34, 109],
      [31, 104],
    ]),
    quads: pair([
      [35, 100],
      [46, 101],
      [46, 126],
      [43, 146],
      [37, 146],
      [33, 123],
    ]),
    adductors: pair([
      [46.5, 101],
      [49.5, 102],
      [48.5, 121],
      [46.5, 124],
    ]),
    calves: pair([
      [35, 157],
      [42, 155],
      [43, 176],
      [38, 186],
      [34, 172],
    ]),
  },
  back: {
    traps: [
      shape([
        [44, 25],
        [56, 25],
        [65, 32],
        [56, 44],
        [50, 53],
        [44, 44],
        [35, 32],
      ]),
    ],
    rear_delts: pair([
      [27, 34],
      [34, 34],
      [34, 44],
      [26, 45],
    ]),
    side_delts: pair(SIDE_DELT),
    upper_back: pair([
      [36, 38],
      [45, 43],
      [46, 55],
      [38, 57],
      [33, 47],
    ]),
    lats: pair([
      [32, 51],
      [44, 58],
      [46, 70],
      [40, 79],
      [34, 72],
      [31, 60],
    ]),
    lower_back: [
      shape([
        [43, 70],
        [57, 70],
        [58, 86],
        [50, 91],
        [42, 86],
      ]),
    ],
    triceps: pair([
      [20, 46],
      [27, 46],
      [27, 62],
      [22, 67],
      [18, 58],
    ]),
    forearms: pair(FOREARM_MUSCLE),
    abductors: pair([
      [30, 90],
      [35, 88],
      [33, 104],
      [30, 100],
    ]),
    glutes: pair([
      [35, 88],
      [49, 91],
      [49, 107],
      [40, 111],
      [33, 104],
    ]),
    hamstrings: pair([
      [34, 113],
      [46, 113],
      [46, 140],
      [41, 147],
      [36, 140],
      [33, 124],
    ]),
    adductors: pair([
      [46.5, 113],
      [49.5, 114],
      [48.5, 129],
      [46.5, 129],
    ]),
    calves: pair([
      [35, 155],
      [45, 155],
      [45, 172],
      [41, 183],
      [37, 183],
      [35, 170],
    ]),
  },
};

export type MuscleRole = 'primary' | 'secondary' | 'none';

export function muscleRole(
  m: Muscle,
  primary: readonly Muscle[],
  secondary: readonly Muscle[],
): MuscleRole {
  if (primary.includes(m)) return 'primary';
  if (secondary.includes(m)) return 'secondary';
  return 'none';
}

/** Which views have something highlighted (so a back-only exercise still reads at a glance). */
export function viewsWith(muscles: readonly Muscle[]): BodyView[] {
  return (['front', 'back'] as const).filter((v) => muscles.some((m) => MUSCLE_SHAPES[v][m]));
}

/** Muscles drawn in a view (each once, in drawing order). */
export function viewMuscles(view: BodyView): Muscle[] {
  return Object.keys(MUSCLE_SHAPES[view]) as Muscle[];
}

/**
 * The side that shows the exercise best: the side with more main muscles; on a tie, the side of
 * the FIRST main muscle (content lists them by importance, so a squat opens on its quads); then
 * secondary muscles; then the front (the side people recognise first).
 */
export function bestView(primary: readonly Muscle[], secondary: readonly Muscle[] = []): BodyView {
  const count = (list: readonly Muscle[], v: BodyView) =>
    list.filter((m) => MUSCLE_SHAPES[v][m]).length;
  const p = count(primary, 'back') - count(primary, 'front');
  if (p !== 0) return p > 0 ? 'back' : 'front';
  const lead = primary.find((m) => !MUSCLE_SHAPES.front[m] !== !MUSCLE_SHAPES.back[m]);
  if (lead) return MUSCLE_SHAPES.back[lead] ? 'back' : 'front';
  return count(secondary, 'back') > count(secondary, 'front') ? 'back' : 'front';
}

/** Ray-casting point-in-polygon. */
export function pointInPolygon(x: number, y: number, pts: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]!;
    const [xj, yj] = pts[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Muscle under a point (view units, 0..VIEW_W × 0..VIEW_H), or null. Later shapes win. */
export function hitTest(view: BodyView, x: number, y: number): Muscle | null {
  const entries = Object.entries(MUSCLE_SHAPES[view]) as [Muscle, RegionShape[]][];
  for (let i = entries.length - 1; i >= 0; i--) {
    const [m, shapes] = entries[i]!;
    if (shapes.some((s) => pointInPolygon(x, y, s.points))) return m;
  }
  return null;
}

export type Box = { x: number; y: number; w: number; h: number };

/**
 * A square crop (view units) centred on `muscles` in `view`, used by the list thumbnail so a
 * 56 dp tile zooms onto what the exercise works instead of a tiny whole figure. Never smaller
 * than `minSize` (keeps context), never outside the figure. No muscles → the torso.
 */
export function focusBox(view: BodyView, muscles: readonly Muscle[], minSize = 64): Box {
  const pts = muscles.flatMap((m) => (MUSCLE_SHAPES[view][m] ?? []).flatMap((s) => s.points));
  let cx = VIEW_W / 2;
  let cy = 60;
  let size = minSize;
  if (pts.length) {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    cx = (x0 + x1) / 2;
    cy = (y0 + y1) / 2;
    size = Math.max(minSize, (x1 - x0) * 1.2, (y1 - y0) * 1.2);
  }
  size = Math.min(size, VIEW_H);
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  const x = clamp(cx - size / 2, Math.min(0, VIEW_W - size), Math.max(0, VIEW_W - size));
  const y = clamp(cy - size / 2, 0, VIEW_H - size);
  return { x: r1(x), y: r1(y), w: r1(size), h: r1(size) };
}

/** Drawn paths per view (derived from MUSCLE_SHAPES; kept for callers that only draw). */
export const MUSCLE_REGIONS: Record<BodyView, Partial<Record<Muscle, string[]>>> = {
  front: Object.fromEntries(
    Object.entries(MUSCLE_SHAPES.front).map(([m, s]) => [m, s.map((x) => x.d)]),
  ),
  back: Object.fromEntries(
    Object.entries(MUSCLE_SHAPES.back).map(([m, s]) => [m, s.map((x) => x.d)]),
  ),
};
