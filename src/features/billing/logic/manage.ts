import type { BillingPlatform, Entitlement, PlanId } from '@/services/billingApi';

import { PACKAGE_NAME } from '../config';
import { planById } from '../plans';

/** Apple's subscriptions page (opens Settings → Subscriptions on iOS). */
export const APPLE_MANAGE_URL = 'https://apps.apple.com/account/subscriptions';

/** Play's subscriptions page, deep-linked to our subscription when the id is known. */
export function playManageUrl(subscriptionId?: string, packageName = PACKAGE_NAME): string {
  const q = subscriptionId
    ? `sku=${encodeURIComponent(subscriptionId)}&package=${encodeURIComponent(packageName)}`
    : `package=${encodeURIComponent(packageName)}`;
  return `https://play.google.com/store/account/subscriptions?${q}`;
}

/**
 * Where "Manage" goes. The store that bills the user wins (a Play subscription seen on an
 * iPhone still opens Play), else the store of this device. Pure.
 */
export function manageSubscriptionUrl(
  os: BillingPlatform,
  opts: { source?: Entitlement['source']; subscriptionId?: string; packageName?: string } = {},
): string {
  const store = opts.source === 'apple' ? 'ios' : opts.source === 'play' ? 'android' : os;
  return store === 'ios' ? APPLE_MANAGE_URL : playManageUrl(opts.subscriptionId, opts.packageName);
}

/** Per-platform cancel instructions (sheet 16 footer). Pure. */
export function cancelInstructions(os: BillingPlatform): string {
  return os === 'ios'
    ? 'Auto-renews until cancelled. Cancel anytime in Settings → your name → Subscriptions on your iPhone, at least 24 hours before renewal.'
    : 'Auto-renews until cancelled. Cancel anytime in Google Play → Profile → Payments & subscriptions → Subscriptions.';
}

export function storeName(source: Entitlement['source'] | BillingPlatform): string {
  return source === 'apple' || source === 'ios' ? 'the App Store' : 'Google Play';
}

function fmtDate(ms: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(ms);
  } catch {
    return new Date(ms).toDateString();
  }
}

export function planLabel(plan: PlanId | null): string {
  return plan ? `Repwise Pro · ${planById(plan).title}` : 'Repwise Pro';
}

/** "Free trial ends 26 November 2026" / "Renews 19 November 2027" / "Ends …". Pure. */
export function renewalLine(e: Entitlement): string | null {
  if (!e.pro || e.expiresAt == null) return null;
  const d = fmtDate(e.expiresAt);
  if (e.inTrial) return e.autoRenew ? `Free trial ends ${d}, then renews` : `Free trial ends ${d}`;
  return e.autoRenew ? `Renews ${d}` : `Ends ${d} (auto-renew is off)`;
}
