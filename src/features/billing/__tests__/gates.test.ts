import { Platform } from 'react-native';

import { proGate } from '@/services/billing';

import { demoOffers } from '../hooks/useBilling';
import {
  canAdaptPlan,
  canLogAteOut,
  canSwapMeal,
  canViewMealDay,
  gateCta,
  GATES,
  gateSource,
  isGateFeature,
} from '../logic/gates';
import { paywallHeadline } from '../logic/headline';
import { fallbackOffers } from '../logic/offers';
import { DEFAULT_PRODUCT_IDS } from '../config';

const DEMO_ENT = { demo: true as const, plan: 'yearly' as const, startedAt: 1, trialEndsAt: null };

describe(`Free vs Pro gates (${Platform.OS})`, () => {
  it('free users get today only; Pro every day', () => {
    expect(canViewMealDay(false, '2026-11-22', '2026-11-22')).toBe(true);
    expect(canViewMealDay(false, '2026-11-23', '2026-11-22')).toBe(false);
    expect(canViewMealDay(true, '2026-11-23', '2026-11-22')).toBe(true);
  });

  it('meal swaps and the ate-out rebalance are Pro', () => {
    expect(canSwapMeal(false)).toBe(false);
    expect(canSwapMeal(true)).toBe(true);
    expect(canLogAteOut(false)).toBe(false);
    expect(canLogAteOut(true)).toBe(true);
  });

  it('the adaptive plan is free for the first plan week only', () => {
    expect(canAdaptPlan(false, '2026-11-16', null)).toBe(true);
    expect(canAdaptPlan(false, '2026-11-16', '2026-11-16')).toBe(true);
    expect(canAdaptPlan(false, '2026-11-23', '2026-11-16')).toBe(false);
    expect(canAdaptPlan(true, '2026-11-23', '2026-11-16')).toBe(true);
  });

  it('every gate has a benefit, a body and a 2–3 line preview, and a gate:<feature> source', () => {
    for (const [f, c] of Object.entries(GATES)) {
      expect(isGateFeature(f)).toBe(true);
      expect(gateSource(f as keyof typeof GATES)).toBe(`gate:${f}`);
      expect(c.title.length).toBeGreaterThan(3);
      expect(c.body.length).toBeGreaterThan(10);
      expect(c.preview.length).toBeGreaterThanOrEqual(2);
      expect(c.preview.length).toBeLessThanOrEqual(3);
      expect(`${c.title} ${c.body} ${c.preview.join(' ')}`).not.toMatch(/\b(cure|treat|diagnose)/i);
    }
    expect(isGateFeature('nope')).toBe(false);
  });

  it('trial wording only while a trial is on offer (F-S5)', () => {
    expect(gateCta(7)).toBe('Start free trial');
    expect(gateCta(0)).toBe('See plans');
  });

  it('the paywall headline names the gate', () => {
    expect(paywallHeadline('gate:meal_swap')).toBe('Swap any meal.');
    expect(paywallHeadline('gate:routines')).toBe('Build every routine you want.');
    expect(paywallHeadline('gate:unknown')).toBe('Train and eat to plan.');
    expect(paywallHeadline('onboarding', 'Sam')).toBe('Your plan is ready, Sam.');
  });
});

describe(`proGate (${Platform.OS})`, () => {
  it('payments off: nobody is gated', () => {
    expect(proGate(false, null, false, null, 0)).toEqual({
      paymentsOn: false,
      subscribed: false,
      demo: false,
      isPro: true,
    });
  });

  it('demo payments on without a purchase: free', () => {
    expect(proGate(false, null, true, null, 0)).toEqual({
      paymentsOn: true,
      subscribed: false,
      demo: false,
      isPro: false,
    });
  });

  it('demo purchase unlocks Pro (test builds only) and is marked demo', () => {
    expect(proGate(false, null, true, DEMO_ENT, 0)).toEqual({
      paymentsOn: true,
      subscribed: true,
      demo: true,
      isPro: true,
    });
  });

  it('a demo entitlement does nothing while demo payments are off', () => {
    expect(proGate(true, null, false, DEMO_ENT, 0).isPro).toBe(false);
  });
});

describe(`demo offers (${Platform.OS})`, () => {
  it('the USD plans become buyable in the demo checkout; order and prices unchanged', () => {
    const fb = fallbackOffers(Platform.OS === 'ios' ? 'ios' : 'android', DEFAULT_PRODUCT_IDS);
    const d = demoOffers(fb);
    expect(d.map((o) => o.plan)).toEqual(['yearly', 'quarterly', 'monthly', 'weekly']);
    expect(d.map((o) => o.price)).toEqual(['$59.99', '$24.99', '$12.99', '$4.99']);
    expect(d.every((o) => o.localised)).toBe(true);
    expect(d[0]!.trialDays).toBe(7);
  });
});
