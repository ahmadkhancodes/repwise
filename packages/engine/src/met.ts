/** Cardio / bodyweight kcal estimate (RW-24): kcal = MET × body weight (kg) × hours. */
export function metKcal(met: number, weightKg: number, minutes: number): number {
  if (met <= 0 || weightKg <= 0 || minutes < 0) throw new RangeError('met and weight must be > 0, minutes ≥ 0');
  return Math.round(met * weightKg * (minutes / 60));
}

/** Rough MET values by intensity for when an exercise has none. */
export const DEFAULT_MET = { light: 3.5, moderate: 6, vigorous: 8.5 } as const;
