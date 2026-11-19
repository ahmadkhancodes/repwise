import { resetDbForTests } from '@/db/client';
import { migrateDb } from '@/db/migrate';
import { setRowOwner } from '@/db/owner';
import { saveProfile } from '@/features/settings/repo';
import { useBillingStore } from '@/services/billing';
import { getCatalog } from '@/services/catalog';
import { kv } from '@/services/storage';

/** Fresh migrated DB, catalogue loaded, no taste signals, payments off (everyone Pro). */
export async function freshDb(): Promise<void> {
  resetDbForTests();
  setRowOwner(null);
  await migrateDb();
  getCatalog();
  kv.remove('meals.signals.v1');
  kv.remove('water.goal.ml');
  useBillingStore.setState({ paymentsEnabled: false, entitlement: null });
}

export function onboard(extra: Record<string, unknown> = {}): void {
  saveProfile({
    goal: 'fat_loss',
    sex: 'female',
    birthYear: 1994,
    heightCm: 168,
    weightKg: 66,
    experience: 'beginner',
    days: 3,
    sessionMin: 45,
    dietType: 'omnivore',
    allergies: ['peanuts'],
    mealsPerDay: 3,
    cookMin: 40,
    ...extra,
  });
}

/** Paid features locked (payments on, no entitlement). */
export function lockPro(): void {
  useBillingStore.setState({ paymentsEnabled: true, entitlement: null });
}
