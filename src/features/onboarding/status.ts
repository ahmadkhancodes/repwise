/**
 * Onboarding status for the launch route. Kept apart from `actions.ts` on purpose (perf audit r2
 * N1): `app/index.tsx` runs before the first frame, and `actions.ts` pulls in the planner service
 * and the engine (zod schemas), which the launch decision does not need.
 */
import { getProfile } from '@/features/settings/repo';

import { useOnboarding } from './store';

/** True once onboarding finished on this phone, or a restored profile says it was done before. */
export function isOnboarded(): boolean {
  if (useOnboarding.getState().phase === 'done') return true;
  try {
    return getProfile()?.onboardedAt != null;
  } catch {
    return false;
  }
}
