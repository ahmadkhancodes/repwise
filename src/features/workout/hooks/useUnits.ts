import { useProfile } from '@/features/settings/repo';

import type { WeightUnit } from '../logic/engine';
import { weightUnitFor } from '../logic/units';

/** The user's weight unit and body weight (cardio kcal), from the profile. */
export function useUnits(): { unit: WeightUnit; units: 'metric' | 'imperial'; bodyKg: number | null } {
  const profile = useProfile();
  const unit = weightUnitFor(profile?.units);
  return { unit, units: unit === 'lb' ? 'imperial' : 'metric', bodyKg: profile?.weightKg ?? null };
}
