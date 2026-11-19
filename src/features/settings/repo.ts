import { asc } from 'drizzle-orm';

import { createRepo, type Row, type RowPatch } from '@/db/repo';
import { profile } from '@/db/schema';

/** profile: one row per device/account (sheet 14). Used by onboarding (S03–S05) and settings (S38). */
export const profileRepo = createRepo(profile, 'profile');
export type Profile = Row<typeof profile>;

export function getProfile(): Profile | undefined {
  return profileRepo.first(undefined, asc(profile.createdAt));
}

/** Create the single profile row on first save, update it afterwards. */
export function saveProfile(patch: RowPatch<typeof profile>): Profile {
  const existing = getProfile();
  if (existing) return profileRepo.update(existing.id, patch) ?? existing;
  return profileRepo.insert(patch);
}

export function useProfile(): Profile | undefined {
  return profileRepo.useLive(undefined, asc(profile.createdAt)).data[0];
}
