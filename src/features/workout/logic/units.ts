import { kgToLb, lbToKg, type WeightUnit } from './engine';

/** Profile `units` → the weight unit shown in the player. Weights are ALWAYS stored in kg. */
export function weightUnitFor(units: string | null | undefined): WeightUnit {
  return units === 'imperial' ? 'lb' : 'kg';
}

/** Smallest plate jump people load in each unit (stepper / pre-fill rounding). */
export function weightStep(unit: WeightUnit): number {
  return unit === 'lb' ? 5 : 2.5;
}

/** Stored kg → the number shown, rounded to 0.1 so 135 lb survives the kg round trip. */
export function toDisplayWeight(kg: number, unit: WeightUnit): number {
  const v = unit === 'lb' ? kgToLb(kg) : kg;
  return Math.round(v * 10) / 10;
}

/** Number typed by the user → kg to store (3 decimals keeps lb exact on the way back). */
export function fromDisplayWeight(value: number, unit: WeightUnit): number {
  const kg = unit === 'lb' ? lbToKg(value) : value;
  return Math.round(kg * 1000) / 1000;
}

/** "80", "82.5", "176.4" — no trailing ".0". Empty string for null (bodyweight / not set). */
export function formatWeight(kg: number | null | undefined, unit: WeightUnit): string {
  if (kg == null) return '';
  return trimNumber(toDisplayWeight(kg, unit));
}

export function trimNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/** Parse what the user typed ("82,5" works too). Null when empty or not a number ≥ 0. */
export function parseNumberInput(text: string): number | null {
  const s = text.trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
