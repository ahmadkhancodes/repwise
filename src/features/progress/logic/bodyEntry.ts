/** Body entry form validation (S30): typed display values → stored kg / cm patch. Pure. */
import { MEASURES, type MeasureKey } from './body';
import { METRIC_LIMITS, parseDecimal, toCm, toKg, type UnitSystem } from './units';

export type BodyPatch = Partial<Record<'weightKg' | MeasureKey, number>>;

export type BodyErrors = Partial<Record<'weight' | MeasureKey | 'form', string>>;

/** Validate typed values (display units) → stored kg/cm patch, or field errors. Pure. */
export function buildBodyPatch(
  values: Partial<Record<'weight' | MeasureKey, string>>,
  units: UnitSystem,
): { patch: BodyPatch; errors: BodyErrors } {
  const patch: BodyPatch = {};
  const errors: BodyErrors = {};
  const w = values.weight?.trim() ? parseDecimal(values.weight) : null;
  if (values.weight?.trim()) {
    const kg = w == null ? null : toKg(w, units);
    if (kg == null || kg < METRIC_LIMITS.weightKg[0] || kg > METRIC_LIMITS.weightKg[1])
      errors.weight = 'Enter a weight like 82.4';
    else patch.weightKg = kg;
  }
  for (const m of MEASURES) {
    const raw = values[m.key]?.trim();
    if (!raw) continue;
    const n = parseDecimal(raw);
    if (m.kind === 'percent') {
      if (n == null || n < METRIC_LIMITS.bodyFatPct[0] || n > METRIC_LIMITS.bodyFatPct[1])
        errors[m.key] = 'Enter a percentage like 18';
      else patch[m.key] = n;
    } else {
      const cm = n == null ? null : toCm(n, units);
      if (cm == null || cm < METRIC_LIMITS.lengthCm[0] || cm > METRIC_LIMITS.lengthCm[1])
        errors[m.key] = 'Check this number';
      else patch[m.key] = cm;
    }
  }
  if (Object.keys(patch).length === 0 && Object.keys(errors).length === 0)
    errors.form = 'Add your weight or a measurement';
  return { patch, errors };
}
