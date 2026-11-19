/**
 * Metric / imperial display for body metrics and loads. Storage is ALWAYS kg and cm (sheet 14);
 * conversion uses the engine's constants. Pure.
 */
import { cmToInches, kgToLb, lbToKg, CM_PER_INCH } from './engine';

export type UnitSystem = 'metric' | 'imperial';

/** profile.units → unit system (anything but 'imperial' is metric). */
export function unitSystem(units: string | null | undefined): UnitSystem {
  return units === 'imperial' ? 'imperial' : 'metric';
}

export function weightUnit(u: UnitSystem): 'kg' | 'lb' {
  return u === 'imperial' ? 'lb' : 'kg';
}

export function lengthUnit(u: UnitSystem): 'cm' | 'in' {
  return u === 'imperial' ? 'in' : 'cm';
}

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

/** kg → display number (1 decimal). */
export function displayWeight(kg: number, u: UnitSystem): number {
  return round(u === 'imperial' ? kgToLb(kg) : kg, 1);
}

/** cm → display number (1 decimal). */
export function displayLength(cm: number, u: UnitSystem): number {
  return round(u === 'imperial' ? cmToInches(cm) : cm, 1);
}

/** Display weight → kg for storage (2 decimals so lb round-trips to 0.1 lb). */
export function toKg(value: number, u: UnitSystem): number {
  return round(u === 'imperial' ? lbToKg(value) : value, 2);
}

/** Display length → cm for storage. */
export function toCm(value: number, u: UnitSystem): number {
  return round(u === 'imperial' ? value * CM_PER_INCH : value, 2);
}

/** "82.4 kg" / "181.7 lb". */
export function formatWeight(kg: number, u: UnitSystem): string {
  return `${displayWeight(kg, u)} ${weightUnit(u)}`;
}

/** Big totals (volume): thousands separators, no decimals. */
export function formatLoad(kg: number, u: UnitSystem): string {
  const v = Math.round(u === 'imperial' ? kgToLb(kg) : kg);
  return `${v.toLocaleString('en-US')} ${weightUnit(u)}`;
}

/** Parse a user-typed number ("82,4" or "82.4"); null if empty or not a positive number. */
export function parseDecimal(text: string): number | null {
  const s = text.trim().replace(',', '.');
  if (s === '') return null;
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Plausible ranges (stored units) so a typo never ruins a chart. */
export const METRIC_LIMITS = {
  weightKg: [20, 400],
  lengthCm: [10, 300],
  bodyFatPct: [2, 75],
} as const;
