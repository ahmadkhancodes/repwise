/**
 * Portion solver (sheet 28 step 4): scale servings of the day's recipes (in 0.25 steps, inside
 * each recipe's scalable bounds) so the day hits kcal ±5% and protein ±10 g.
 * Deterministic discrete local search (single and paired moves).
 */

export const KCAL_TOLERANCE = 0.05;
export const PROTEIN_TOLERANCE_G = 10;
export const PORTION_STEP = 0.25;

export interface PortionItem {
  perServing: { kcal: number; protein: number; carbs: number; fat: number };
  min: number;
  max: number;
}

export interface PortionTarget {
  kcal: number;
  protein: number;
}

export interface Totals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface PortionResult {
  servings: number[];
  totals: Totals;
  ok: boolean;
  kcalError: number;
  proteinError: number;
}

export function withinTargets(totals: Pick<Totals, 'kcal' | 'protein'>, target: PortionTarget, kcalTol = KCAL_TOLERANCE, proteinTolG = PROTEIN_TOLERANCE_G): boolean {
  return Math.abs(totals.kcal - target.kcal) <= target.kcal * kcalTol + 1e-9 && Math.abs(totals.protein - target.protein) <= proteinTolG + 1e-9;
}

export function totalsFor(items: readonly PortionItem[], servings: readonly number[]): Totals {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  items.forEach((it, i) => {
    const s = servings[i] ?? 0;
    t.kcal += it.perServing.kcal * s;
    t.protein += it.perServing.protein * s;
    t.carbs += it.perServing.carbs * s;
    t.fat += it.perServing.fat * s;
  });
  return { kcal: round1(t.kcal), protein: round1(t.protein), carbs: round1(t.carbs), fat: round1(t.fat) };
}

export interface SolveOptions {
  step?: number;
  kcalTol?: number;
  proteinTolG?: number;
}

export function solvePortions(items: readonly PortionItem[], target: PortionTarget, opts: SolveOptions = {}): PortionResult {
  const step = opts.step ?? PORTION_STEP;
  const kTol = (opts.kcalTol ?? KCAL_TOLERANCE) * target.kcal;
  const pTol = opts.proteinTolG ?? PROTEIN_TOLERANCE_G;
  if (items.length === 0) {
    const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    return { servings: [], totals, ok: withinTargets(totals, target), kcalError: -target.kcal, proteinError: -target.protein };
  }
  const lo = items.map((it) => Math.ceil(it.min / step - 1e-9) * step);
  const hi = items.map((it, i) => Math.max(lo[i] as number, Math.floor(it.max / step + 1e-9) * step));
  const clamp = (v: number, i: number) => Math.min(hi[i] as number, Math.max(lo[i] as number, Math.round(v / step) * step));

  const sumK = items.reduce((a, it) => a + it.perServing.kcal, 0);
  const s: number[] = items.map((_, i) => clamp(sumK > 0 ? target.kcal / sumK : 1, i));

  const kc = items.map((it) => it.perServing.kcal);
  const pc = items.map((it) => it.perServing.protein);
  // Hinge-style emphasis outside tolerance + small regularisation toward 1 serving.
  const costOf = (k: number, p: number, reg: number): number => {
    const ke = (k - target.kcal) / kTol;
    const pe = (p - target.protein) / pTol;
    return ke * ke + pe * pe + Math.max(0, Math.abs(ke) - 0.8) * 10 + Math.max(0, Math.abs(pe) - 0.8) * 10 + 0.01 * reg;
  };
  // Running totals: each candidate move is scored in O(1) instead of re-summing every item
  // (ENGINE_QA bug 1: the solver was the planner's hottest function on infeasible days).
  let K = 0;
  let P = 0;
  let R = 0;
  const resum = () => {
    K = 0;
    P = 0;
    R = 0;
    for (let i = 0; i < s.length; i++) {
      const x = s[i] as number;
      K += (kc[i] as number) * x;
      P += (pc[i] as number) * x;
      R += (x - 1) * (x - 1);
    }
  };
  resum();
  let current = costOf(K, P, R);
  const deltas = [step, -step, 2 * step, -2 * step];
  for (let iter = 0; iter < 400; iter++) {
    let bestCost = current;
    let bestMove: [number, number, number, number] | undefined; // i, di, j, dj
    for (let i = 0; i < s.length; i++) {
      const x = s[i] as number;
      for (const d of deltas) {
        const v = x + d;
        if (v < (lo[i] as number) - 1e-9 || v > (hi[i] as number) + 1e-9) continue;
        const c = costOf(K + (kc[i] as number) * d, P + (pc[i] as number) * d, R - (x - 1) * (x - 1) + (v - 1) * (v - 1));
        if (c < bestCost - 1e-12) {
          bestCost = c;
          bestMove = [i, d, -1, 0];
        }
      }
    }
    // Paired moves trade kcal for protein between two meals.
    for (let i = 0; i < s.length; i++) {
      const xi = s[i] as number;
      const vi = xi + step;
      if (vi > (hi[i] as number) + 1e-9) continue;
      for (let j = 0; j < s.length; j++) {
        if (i === j) continue;
        const xj = s[j] as number;
        const vj = xj - step;
        if (vj < (lo[j] as number) - 1e-9) continue;
        const c = costOf(
          K + ((kc[i] as number) - (kc[j] as number)) * step,
          P + ((pc[i] as number) - (pc[j] as number)) * step,
          R - (xi - 1) * (xi - 1) + (vi - 1) * (vi - 1) - (xj - 1) * (xj - 1) + (vj - 1) * (vj - 1),
        );
        if (c < bestCost - 1e-12) {
          bestCost = c;
          bestMove = [i, step, j, -step];
        }
      }
    }
    if (!bestMove) break;
    const [i, di, j, dj] = bestMove;
    s[i] = round3((s[i] as number) + di);
    if (j >= 0) s[j] = round3((s[j] as number) + dj);
    resum(); // exact totals after each accepted move (no drift)
    current = costOf(K, P, R);
  }
  const totals = totalsFor(items, s);
  return {
    servings: s.map(round3),
    totals,
    ok: withinTargets(totals, target, opts.kcalTol, pTol),
    kcalError: round1(totals.kcal - target.kcal),
    proteinError: round1(totals.protein - target.protein),
  };
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const round3 = (x: number) => Math.round(x * 1000) / 1000;
