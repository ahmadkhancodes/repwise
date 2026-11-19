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
type Pt = readonly [number, number];

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

/** Left-side shape and its mirror. */
const pair = (points: readonly Pt[]): string[] => [blob(points), blob(mirror(points))];

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
  ...pair(UPPER_ARM),
  ...pair(FOREARM),
  ellipse(13, 112, 4, 6),
  ellipse(87, 112, 4, 6),
  ...pair(THIGH),
  ...pair(SHIN),
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

export const MUSCLE_REGIONS: Record<BodyView, Partial<Record<Muscle, string[]>>> = {
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
      blob([
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
      blob([
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
      blob([
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
  return (['front', 'back'] as const).filter((v) => muscles.some((m) => MUSCLE_REGIONS[v][m]));
}
