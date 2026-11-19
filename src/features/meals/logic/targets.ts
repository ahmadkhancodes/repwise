/** S20 helpers. Pure. */
import type { MacroSet } from '@repwise/engine';

/** Atwater factors (kcal per gram), same as the engine's kcalFromMacros. */
const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

/** Share of the day's energy from each macro, whole percent (0 when kcal is 0). */
export function energyShare(m: MacroSet): { protein: number; carbs: number; fat: number } {
  const pct = (g: number, f: number) => (m.kcal > 0 ? Math.round(((g * f) / m.kcal) * 100) : 0);
  return {
    protein: pct(m.protein, KCAL_PER_G.protein),
    carbs: pct(m.carbs, KCAL_PER_G.carbs),
    fat: pct(m.fat, KCAL_PER_G.fat),
  };
}
