import { Platform } from 'react-native';

import {
  cancelInstructions,
  manageSubscriptionUrl,
  playManageUrl,
  renewalLine,
} from '../logic/manage';

const os = Platform.OS === 'ios' ? 'ios' : 'android';

describe(`manage links (${Platform.OS})`, () => {
  it('opens this platform’s store subscriptions page', () => {
    expect(manageSubscriptionUrl(os, { subscriptionId: 'repwise_pro' })).toBe(
      os === 'ios'
        ? 'https://apps.apple.com/account/subscriptions'
        : 'https://play.google.com/store/account/subscriptions?sku=repwise_pro&package=com.client.repwise',
    );
  });

  it('the billing store wins when the subscription came from the other platform', () => {
    expect(manageSubscriptionUrl('android', { source: 'apple' })).toBe(
      'https://apps.apple.com/account/subscriptions',
    );
    expect(manageSubscriptionUrl('ios', { source: 'play', subscriptionId: 'repwise_pro' })).toBe(
      playManageUrl('repwise_pro'),
    );
    expect(playManageUrl()).toBe(
      'https://play.google.com/store/account/subscriptions?package=com.client.repwise',
    );
  });

  it('cancel instructions name the right store', () => {
    expect(cancelInstructions(os)).toContain(
      os === 'ios' ? 'Subscriptions on your iPhone' : 'Google Play',
    );
  });

  it('renewal line covers trial, renewing and ending', () => {
    const base = {
      pro: true,
      plan: 'yearly' as const,
      source: 'apple' as const,
      expiresAt: Date.UTC(2026, 10, 26, 12),
      updatedAt: 1,
    };
    expect(renewalLine({ ...base, inTrial: true, autoRenew: true })).toMatch(
      /^Free trial ends .*2026, then renews$/,
    );
    expect(renewalLine({ ...base, inTrial: false, autoRenew: true })).toMatch(/^Renews /);
    expect(renewalLine({ ...base, inTrial: false, autoRenew: false })).toMatch(/auto-renew is off/);
    expect(renewalLine({ ...base, pro: false, inTrial: false, autoRenew: false })).toBeNull();
  });
});
