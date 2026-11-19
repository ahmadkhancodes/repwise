import type { ProductIds } from '@/services/billingApi';

/**
 * Store product ids (sheet 05/16). Mirrors `DEFAULT_PLANS` in server/src/config.ts;
 * `GET /config` `plans` overrides these at runtime when payments are on.
 */
export const DEFAULT_PRODUCT_IDS: ProductIds = {
  ios: {
    weekly: 'com.client.repwise.pro.weekly',
    monthly: 'com.client.repwise.pro.monthly',
    quarterly: 'com.client.repwise.pro.quarterly',
    yearly: 'com.client.repwise.pro.yearly',
  },
  android: {
    subscriptionId: 'repwise_pro',
    basePlans: { weekly: 'weekly', monthly: 'monthly', quarterly: 'quarterly', yearly: 'yearly' },
  },
};

/** Android applicationId / iOS bundle id (app.config.ts). */
export const PACKAGE_NAME = 'com.client.repwise';

/** Sheet 21 (privacy URL); terms live next to it. */
export const LEGAL_URLS = {
  terms: 'https://repwise.app/terms',
  privacy: 'https://repwise.app/privacy',
} as const;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Offline grace: a cached Pro entitlement stays valid this long past its expiry while we cannot reach the Worker. */
export const OFFLINE_GRACE_MS = 3 * DAY;
/** A cached entitlement older than this (no successful server check) no longer unlocks Pro. */
export const MAX_CACHE_AGE_MS = 30 * DAY;
/** Re-check the entitlement on foreground when the cache is older than this. */
export const ENTITLEMENT_REFRESH_MS = 6 * HOUR;
/** Days before the trial ends that the trial reminder fires (sheet 05: "2 days before"). */
export const TRIAL_REMINDER_DAYS_BEFORE_END = 2;
