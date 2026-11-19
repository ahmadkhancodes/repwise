/**
 * Water lives in food_logs (no schema change): one row per quick-add with slot 'water',
 * source 'quick', kcal 0 and the amount in the name ("Water 250 ml"). See docs/DECISIONS.md.
 */
export const WATER_SLOT = 'water';
export const GLASS_ML = 250;
/** Default daily goal in glasses (8 × 250 ml); a preference, never advice. */
export const DEFAULT_GOAL_GLASSES = 8;

export function waterLogName(ml: number = GLASS_ML): string {
  return `Water ${Math.round(ml)} ml`;
}

/** Amount of one water row, read from its name; a bare "Water" row counts as one glass. */
export function waterMlOf(name: string): number {
  const m = /(\d+)\s*ml/i.exec(name);
  const ml = m ? Number(m[1]) : GLASS_ML;
  return Number.isFinite(ml) && ml > 0 ? ml : GLASS_ML;
}

export function isWaterLog(row: { slot: string | null }): boolean {
  return row.slot === WATER_SLOT;
}

export function waterTotalMl(rows: { slot: string | null; name: string }[]): number {
  return rows.filter(isWaterLog).reduce((s, r) => s + waterMlOf(r.name), 0);
}

/** Glasses for the dots row: filled = whole glasses drunk (capped at the goal). */
export function waterGlasses(totalMl: number, goalGlasses = DEFAULT_GOAL_GLASSES) {
  const filled = Math.min(goalGlasses, Math.floor(totalMl / GLASS_ML));
  return { filled, goal: goalGlasses, goalMl: goalGlasses * GLASS_ML };
}
