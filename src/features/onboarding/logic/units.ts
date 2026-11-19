/**
 * Wheel items for body stats in metric or imperial. Values are always metric (cm, kg); labels follow
 * the chosen units. Conversions use the engine's constants. Pure.
 */
import { cmToFtIn, kgToLb, lbToKg } from '@/features/planner/engine';

import type { Units } from './answers';
import { HEIGHT_CM, MAX_AGE, MIN_AGE, WEIGHT_KG } from './steps';

export type Item = { value: number; label: string };

const round = (n: number, step: number) => Math.round(n / step) * step;

export function heightItems(units: Units): Item[] {
  if (units === 'metric') {
    const out: Item[] = [];
    for (let cm = HEIGHT_CM.min; cm <= HEIGHT_CM.max; cm++)
      out.push({ value: cm, label: `${cm} cm` });
    return out;
  }
  const out: Item[] = [];
  const minIn = Math.ceil(HEIGHT_CM.min / 2.54);
  const maxIn = Math.floor(HEIGHT_CM.max / 2.54);
  for (let inches = minIn; inches <= maxIn; inches++) {
    out.push({
      value: round(inches * 2.54, 0.1),
      label: `${Math.floor(inches / 12)}′ ${inches % 12}″`,
    });
  }
  return out;
}

export function weightItems(units: Units): Item[] {
  const out: Item[] = [];
  if (units === 'metric') {
    for (let kg = WEIGHT_KG.min; kg <= WEIGHT_KG.max; kg++)
      out.push({ value: kg, label: `${kg} kg` });
    return out;
  }
  const minLb = Math.ceil(kgToLb(WEIGHT_KG.min));
  const maxLb = Math.floor(kgToLb(WEIGHT_KG.max));
  for (let lb = minLb; lb <= maxLb; lb++)
    out.push({ value: round(lbToKg(lb), 0.01), label: `${lb} lb` });
  return out;
}

export function birthYearItems(currentYear: number): Item[] {
  const out: Item[] = [];
  for (let y = currentYear - MIN_AGE; y >= currentYear - MAX_AGE; y--)
    out.push({ value: y, label: String(y) });
  return out;
}

/** The item whose value is closest to `v` (wheels need an exact item value). */
export function nearestValue(
  items: readonly Item[],
  v: number | null | undefined,
): number | undefined {
  if (v == null || items.length === 0) return items[0]?.value;
  let best = items[0]!;
  for (const it of items) if (Math.abs(it.value - v) < Math.abs(best.value - v)) best = it;
  return best.value;
}

export function formatHeight(cm: number, units: Units): string {
  if (units === 'metric') return `${Math.round(cm)} cm`;
  const { ft, in: inches } = cmToFtIn(cm);
  return `${ft}′ ${Math.round(inches)}″`;
}

export function formatWeight(kg: number, units: Units): string {
  return units === 'metric' ? `${Math.round(kg * 10) / 10} kg` : `${Math.round(kgToLb(kg))} lb`;
}
