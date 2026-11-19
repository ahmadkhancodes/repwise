import type { ProductSubscription } from 'react-native-iap';

import { ANDROID_PRODUCTS, IOS_PRODUCTS } from '../../../../test/billingFakes';
import { DEFAULT_PRODUCT_IDS as IDS } from '../config';
import {
  androidOffers,
  fallbackOffers,
  iosOffers,
  isoPeriodDays,
  mergeWithFallback,
} from '../logic/offers';

describe('offers', () => {
  it('parses ISO 8601 billing periods', () => {
    expect(isoPeriodDays('P7D')).toBe(7);
    expect(isoPeriodDays('P1W')).toBe(7);
    expect(isoPeriodDays('P1M')).toBe(30);
    expect(isoPeriodDays('P1Y')).toBe(365);
    expect(isoPeriodDays('garbage')).toBe(0);
  });

  it('iOS: localised prices per product, trial only when eligible', () => {
    const offers = iosOffers(IOS_PRODUCTS, IDS, true);
    expect(offers.map((o) => [o.plan, o.sku, o.price, o.trialDays])).toEqual([
      ['yearly', 'com.client.repwise.pro.yearly', '£45.99', 7],
      ['quarterly', 'com.client.repwise.pro.quarterly', '£18.99', 0],
      ['monthly', 'com.client.repwise.pro.monthly', '£9.99', 0],
      ['weekly', 'com.client.repwise.pro.weekly', '£3.99', 0],
    ]);
    expect(offers[0]!.perWeek).toBe('£0.88');
    expect(offers.every((o) => o.localised && !o.offerToken)).toBe(true);
    expect(iosOffers(IOS_PRODUCTS, IDS, false)[0]!.trialDays).toBe(0);
  });

  it('iOS: falls back to the legacy intro fields', () => {
    const legacy = IOS_PRODUCTS.map((p) => ({
      ...p,
      subscriptionOffers: [],
      introductoryPriceSubscriptionPeriodIOS: 'day',
      introductoryPriceNumberOfPeriodsIOS: '7',
    })) as unknown as ProductSubscription[];
    expect(iosOffers(legacy, IDS, true)[0]!.trialDays).toBe(7);
  });

  it('Android: one subscription, 4 base plans; yearly uses the free-trial offer', () => {
    const offers = androidOffers(ANDROID_PRODUCTS, IDS);
    expect(offers.map((o) => [o.plan, o.basePlanId, o.offerToken, o.price, o.trialDays])).toEqual([
      ['yearly', 'yearly', 'tok-yearly-trial', '£45.99', 7],
      ['quarterly', 'quarterly', 'tok-quarterly', '£18.99', 0],
      ['monthly', 'monthly', 'tok-monthly', '£9.99', 0],
      ['weekly', 'weekly', 'tok-weekly', '£3.99', 0],
    ]);
    expect(offers.every((o) => o.sku === 'repwise_pro')).toBe(true);
    expect(offers[0]!.amount).toBeCloseTo(45.99);
  });

  it('Android: no trial offer returned (not eligible) → base plan, no trial claim', () => {
    const p = ANDROID_PRODUCTS[0] as unknown as { subscriptionOffers: { id: string }[] };
    const noTrial = [
      { ...p, subscriptionOffers: p.subscriptionOffers.filter((o) => o.id !== 'trial-7d') },
    ];
    const yearly = androidOffers(noTrial as unknown as ProductSubscription[], IDS)[0]!;
    expect(yearly.trialDays).toBe(0);
    expect(yearly.offerToken).toBe('tok-yearly');
  });

  it('missing products fall back to the USD ladder (not purchasable)', () => {
    for (const os of ['ios', 'android'] as const) {
      const fb = fallbackOffers(os, IDS);
      expect(fb.map((o) => o.price)).toEqual(['$59.99', '$24.99', '$12.99', '$4.99']);
      expect(fb.every((o) => !o.localised)).toBe(true);
      const merged = mergeWithFallback(iosOffers(IOS_PRODUCTS.slice(3), IDS, true), fb);
      expect(merged.map((o) => o.price)).toEqual(['£45.99', '$24.99', '$12.99', '$4.99']);
    }
    expect(androidOffers([], IDS)).toEqual([]);
  });
});
