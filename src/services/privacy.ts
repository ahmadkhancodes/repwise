import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { zustandStorage } from './storage';

type PrivacyState = {
  /**
   * Settings → Privacy → "Share anonymous usage data". Covers product analytics (PostHog) and
   * crash reports (Sentry). Default ON (sheet 23); nothing is ever linked to the user's identity.
   */
  shareUsageData: boolean;
  setShareUsageData: (on: boolean) => void;
};

export const usePrivacyStore = create<PrivacyState>()(
  persist(
    (set) => ({
      shareUsageData: true,
      setShareUsageData: (shareUsageData) => set({ shareUsageData }),
    }),
    {
      name: 'privacy',
      storage: createJSONStorage(() => zustandStorage),
      partialize: (s) => ({ shareUsageData: s.shareUsageData }),
    },
  ),
);

/** Non-React read for services (analytics sink, Sentry beforeSend). */
export function isUsageSharingOn(): boolean {
  return usePrivacyStore.getState().shareUsageData;
}

/** React hook for the Settings toggle. */
export function useShareUsageData(): [boolean, (on: boolean) => void] {
  const on = usePrivacyStore((s) => s.shareUsageData);
  const set = usePrivacyStore((s) => s.setShareUsageData);
  return [on, set];
}
