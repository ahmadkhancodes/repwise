/**
 * Geometry for the front/back muscle map (S32, W6). Stylised, calm shapes on a 200 × 400
 * viewBox: each muscle is a polygon (left side, mirrored for the right) that is drawn as a
 * smooth closed path. Pure, so hit-testing and paths are unit-tested.
 */
import type { Muscle } from './engine';

export const BODY_VIEWBOX = { width: 200, height: 400 } as const;
export type BodyView = 'front' | 'back';
type P = readonly [number, number];

type RegionDef = { muscle: Muscle; points: readonly P[]; mirror: boolean };

const r = (muscle: Muscle, points: readonly P[], mirror = true): RegionDef => ({
  muscle,
  points,
  mirror,
});

const FRONT: RegionDef[] = [
  r('traps', [
    [92, 58],
    [80, 65],
    [93, 68],
  ]),
  r('front_delts', [
    [79, 67],
    [68, 72],
    [64, 86],
    [71, 94],
    [80, 82],
  ]),
  r('side_delts', [
    [66, 70],
    [57, 79],
    [56, 94],
    [62, 95],
    [64, 82],
  ]),
  r('chest', [
    [98, 70],
    [82, 70],
    [73, 86],
    [77, 104],
    [98, 108],
  ]),
  r('biceps', [
    [63, 99],
    [57, 112],
    [56, 138],
    [63, 145],
    [70, 130],
    [71, 104],
  ]),
  r('forearms', [
    [55, 150],
    [49, 170],
    [47, 194],
    [54, 197],
    [62, 175],
    [64, 152],
  ]),
  r(
    'abs',
    [
      [89, 113],
      [111, 113],
      [111, 184],
      [100, 194],
      [89, 184],
    ],
    false,
  ),
  r('obliques', [
    [86, 114],
    [77, 113],
    [75, 150],
    [80, 180],
    [86, 184],
  ]),
  r('abductors', [
    [75, 188],
    [68, 200],
    [68, 224],
    [73, 214],
    [78, 197],
  ]),
  r('quads', [
    [81, 200],
    [72, 226],
    [72, 276],
    [80, 294],
    [91, 290],
    [94, 240],
    [92, 206],
  ]),
  r('adductors', [
    [95, 206],
    [99, 212],
    [98, 252],
    [95, 248],
  ]),
  r('calves', [
    [75, 312],
    [71, 338],
    [75, 372],
    [84, 378],
    [89, 346],
    [88, 314],
  ]),
];

const BACK: RegionDef[] = [
  r(
    'traps',
    [
      [100, 56],
      [84, 65],
      [78, 70],
      [92, 80],
      [100, 112],
      [108, 80],
      [122, 70],
      [116, 65],
    ],
    false,
  ),
  r('rear_delts', [
    [78, 68],
    [66, 72],
    [60, 88],
    [68, 94],
    [80, 80],
  ]),
  r('side_delts', [
    [66, 70],
    [57, 79],
    [56, 94],
    [62, 95],
    [64, 82],
  ]),
  r('upper_back', [
    [93, 84],
    [82, 84],
    [84, 106],
    [97, 116],
  ]),
  r('lats', [
    [80, 88],
    [71, 100],
    [77, 140],
    [90, 158],
    [95, 134],
    [84, 110],
  ]),
  r('triceps', [
    [61, 99],
    [55, 112],
    [55, 140],
    [62, 147],
    [70, 128],
    [70, 102],
  ]),
  r('forearms', [
    [55, 150],
    [49, 170],
    [47, 194],
    [54, 197],
    [62, 175],
    [64, 152],
  ]),
  r(
    'lower_back',
    [
      [90, 148],
      [110, 148],
      [112, 180],
      [100, 188],
      [88, 180],
    ],
    false,
  ),
  r('glutes', [
    [98, 190],
    [79, 192],
    [71, 213],
    [80, 235],
    [98, 231],
  ]),
  r('abductors', [
    [74, 186],
    [67, 198],
    [68, 214],
    [74, 200],
  ]),
  r('hamstrings', [
    [79, 240],
    [73, 270],
    [77, 300],
    [88, 300],
    [95, 270],
    [96, 240],
  ]),
  r('calves', [
    [75, 312],
    [69, 334],
    [73, 368],
    [84, 376],
    [90, 346],
    [88, 316],
  ]),
];

export type BodyRegion = {
  key: string;
  muscle: Muscle;
  side: 'left' | 'right' | 'center';
  points: P[];
  d: string;
};

const mirrorPts = (pts: readonly P[]): P[] =>
  pts.map(([x, y]) => [BODY_VIEWBOX.width - x, y] as P).reverse();

const f1 = (n: number) => Math.round(n * 10) / 10;

/** Smooth closed path through the polygon: quadratic curves between edge midpoints. */
export function smoothClosedPath(points: readonly P[]): string {
  const n = points.length;
  if (n < 3) return '';
  const mid = (a: P, b: P): P => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = mid(points[n - 1]!, points[0]!);
  let d = `M${f1(start[0])} ${f1(start[1])}`;
  for (let i = 0; i < n; i++) {
    const p = points[i]!;
    const m = mid(p, points[(i + 1) % n]!);
    d += ` Q${f1(p[0])} ${f1(p[1])} ${f1(m[0])} ${f1(m[1])}`;
  }
  return `${d} Z`;
}

/** All regions for one view (left + mirrored right). */
export function bodyRegions(view: BodyView): BodyRegion[] {
  const defs = view === 'front' ? FRONT : BACK;
  const out: BodyRegion[] = [];
  for (const def of defs) {
    if (!def.mirror) {
      out.push({
        key: `${def.muscle}-c`,
        muscle: def.muscle,
        side: 'center',
        points: [...def.points],
        d: smoothClosedPath(def.points),
      });
      continue;
    }
    const right = mirrorPts(def.points);
    out.push({
      key: `${def.muscle}-l`,
      muscle: def.muscle,
      side: 'left',
      points: [...def.points],
      d: smoothClosedPath(def.points),
    });
    out.push({
      key: `${def.muscle}-r`,
      muscle: def.muscle,
      side: 'right',
      points: right,
      d: smoothClosedPath(right),
    });
  }
  return out;
}

/** Muscles drawn in a view (each once). */
export function viewMuscles(view: BodyView): Muscle[] {
  return [...new Set((view === 'front' ? FRONT : BACK).map((d) => d.muscle))];
}

/** Neutral silhouette parts (head, neck, hands, knees, feet) so the figure reads as a body. */
export function silhouette(): string[] {
  const head =
    'M100 10 C112 10 119 20 119 32 C119 46 111 56 100 56 C89 56 81 46 81 32 C81 20 88 10 100 10 Z';
  const neck = 'M92 52 L108 52 L109 64 L91 64 Z';
  const hand = (cx: number) =>
    `M${cx - 5} 199 Q${cx} 196 ${cx + 5} 199 L${cx + 5} 212 Q${cx} 216 ${cx - 5} 212 Z`;
  const knee = (cx: number) =>
    `M${cx - 8} 296 Q${cx} 292 ${cx + 8} 296 L${cx + 7} 310 Q${cx} 313 ${cx - 7} 310 Z`;
  const foot = (cx: number) =>
    `M${cx - 7} 378 Q${cx} 375 ${cx + 7} 378 L${cx + 9} 392 Q${cx} 395 ${cx - 9} 392 Z`;
  return [head, neck, hand(51), hand(149), knee(83), knee(117), foot(80), foot(120)];
}

/** Ray-casting point-in-polygon. */
export function pointInPolygon(x: number, y: number, pts: readonly P[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]!;
    const [xj, yj] = pts[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Muscle under a point in viewBox units, or null. */
export function hitTest(view: BodyView, x: number, y: number): Muscle | null {
  for (const region of bodyRegions(view))
    if (pointInPolygon(x, y, region.points)) return region.muscle;
  return null;
}
