/**
 * RW-38 water. Stored as food_logs rows (slot 'water', source 'quick', kcal 0) because the schema has
 * no water table yet; the amount is kept in the name ("Water 250 ml") and parsed back. Pure.
 */
export const WATER_SLOT = 'water';
export const GLASS_ML = 250;
export const DEFAULT_WATER_GOAL_ML = 2000;
export const WATER_GOAL_MIN = 1000;
export const WATER_GOAL_MAX = 5000;
export const QUICK_ADD_ML = [150, 250, 330, 500] as const;

export const isWaterLog = (r: { slot: string | null }) => r.slot === WATER_SLOT;

export function waterName(ml: number): string {
  return `Water ${Math.round(ml)} ml`;
}

export function waterMl(r: { slot: string | null; name: string }): number {
  if (!isWaterLog(r)) return 0;
  const m = /(\d+)\s*ml/i.exec(r.name);
  return m ? Number(m[1]) : 0;
}

export function totalWaterMl(rows: readonly { slot: string | null; name: string }[]): number {
  return rows.reduce((t, r) => t + waterMl(r), 0);
}

/** "1.25 L" from 1250; "750 ml" under a litre. */
export function formatWater(ml: number): string {
  if (ml < 1000) return `${Math.round(ml)} ml`;
  return `${Math.round(ml / 10) / 100} L`;
}

/** Glasses shown in the visual (goal rounded up to whole glasses, at least 4). */
export function glassCount(goalMl: number, glassMl = GLASS_ML): number {
  return Math.max(4, Math.ceil(goalMl / glassMl));
}

export function clampWaterGoal(ml: number): number {
  return Math.min(WATER_GOAL_MAX, Math.max(WATER_GOAL_MIN, Math.round(ml / 250) * 250));
}
