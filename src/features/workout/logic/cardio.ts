import { DEFAULT_MET, metKcal } from './engine';

export function isCardioPattern(pattern: string | undefined): boolean {
  return pattern === 'cardio';
}

/** Rough kcal for a cardio entry (RW-24): engine MET × body weight × time. Null without weight. */
export function cardioKcal(
  durationS: number | null | undefined,
  bodyKg: number | null | undefined,
  met: number = DEFAULT_MET.moderate,
): number | null {
  if (!durationS || durationS <= 0 || !bodyKg || bodyKg <= 0) return null;
  return metKcal(met, bodyKg, durationS / 60);
}

/** Metres → "5.2 km" / "800 m"; miles for imperial users. */
export function formatDistance(m: number | null | undefined, units: 'metric' | 'imperial'): string {
  if (!m || m <= 0) return '';
  if (units === 'imperial') return `${(m / 1609.344).toFixed(2).replace(/\.?0+$/, '')} mi`;
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2).replace(/\.?0+$/, '')} km`;
}

/** Distance typed in km or mi → metres stored. */
export function distanceToMetres(value: number, units: 'metric' | 'imperial'): number {
  return Math.round((units === 'imperial' ? value * 1609.344 : value * 1000) * 10) / 10;
}

export function metresToDisplay(m: number | null | undefined, units: 'metric' | 'imperial'): number | null {
  if (m == null) return null;
  const v = units === 'imperial' ? m / 1609.344 : m / 1000;
  return Math.round(v * 100) / 100;
}
