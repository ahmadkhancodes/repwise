import { Platform } from 'react-native';

import {
  DEMO_PAYMENTS_AVAILABLE,
  demoCheckoutActive,
  demoPaymentsAvailable,
  demoPaymentsDefaultOn,
  demoProActive,
  grantDemoEntitlement,
  parseDemoEntitlement,
  resetDemoEntitlement,
  resetDemoPaymentsState,
  setDemoPaymentsOn,
  useDemoPayments,
} from '../demoPayments';
import { kv } from '../storage';

beforeEach(() => {
  kv.remove('billing.demo.on.v1');
  kv.remove('billing.demo.entitlement.v1');
  resetDemoPaymentsState();
});

describe(`demo payments flags (${Platform.OS})`, () => {
  it('is available everywhere except production', () => {
    expect(demoPaymentsAvailable({ appEnv: 'production' })).toBe(false);
    expect(demoPaymentsAvailable({ appEnv: 'production', demo: '1' })).toBe(false);
    expect(demoPaymentsAvailable({ appEnv: 'preview' })).toBe(true);
    expect(demoPaymentsAvailable({ appEnv: 'development' })).toBe(true);
    expect(demoPaymentsAvailable({})).toBe(true);
    expect(demoPaymentsAvailable({ appEnv: 'preview', demo: '0' })).toBe(false);
  });

  it('is on by default only in preview or with EXPO_PUBLIC_DEMO_PAYMENTS=1', () => {
    expect(demoPaymentsDefaultOn({ appEnv: 'preview' })).toBe(true);
    expect(demoPaymentsDefaultOn({ demo: '1' })).toBe(true);
    expect(demoPaymentsDefaultOn({})).toBe(false);
    expect(demoPaymentsDefaultOn({ appEnv: 'production', demo: '1' })).toBe(false);
  });

  it('test builds can use it; off until switched on', () => {
    expect(DEMO_PAYMENTS_AVAILABLE).toBe(true);
    expect(demoCheckoutActive()).toBe(false);
    setDemoPaymentsOn(true);
    expect(demoCheckoutActive()).toBe(true);
    expect(kv.getString('billing.demo.on.v1')).toBe('1');
    setDemoPaymentsOn(false);
    expect(demoCheckoutActive()).toBe(false);
  });
});

describe(`demo entitlement (${Platform.OS})`, () => {
  it('grants a clearly-marked TEST entitlement with the trial end, and resets', () => {
    grantDemoEntitlement('yearly', 7, 1_000);
    const e = useDemoPayments.getState().entitlement!;
    expect(e).toEqual({
      demo: true,
      plan: 'yearly',
      startedAt: 1_000,
      trialEndsAt: 1_000 + 7 * 86_400_000,
    });
    expect(parseDemoEntitlement(kv.getString('billing.demo.entitlement.v1'))).toEqual(e);
    expect(demoProActive(e)).toBe(true);
    resetDemoEntitlement();
    expect(useDemoPayments.getState().entitlement).toBeNull();
    expect(kv.getString('billing.demo.entitlement.v1')).toBeUndefined();
  });

  it('paid plans have no trial end', () => {
    grantDemoEntitlement('weekly', 0, 5);
    expect(useDemoPayments.getState().entitlement?.trialEndsAt).toBeNull();
  });

  it('rejects anything that is not a demo entitlement', () => {
    expect(parseDemoEntitlement(undefined)).toBeNull();
    expect(parseDemoEntitlement('nope')).toBeNull();
    expect(parseDemoEntitlement(JSON.stringify({ plan: 'yearly', startedAt: 1 }))).toBeNull();
    expect(demoProActive(null)).toBe(false);
    expect(
      demoProActive({ demo: true, plan: 'yearly', startedAt: 1, trialEndsAt: null }, false),
    ).toBe(false);
  });
});

describe(`production build (${Platform.OS})`, () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('makes the demo path impossible, even with EXPO_PUBLIC_DEMO_PAYMENTS=1 and stored state', () => {
    kv.set('billing.demo.on.v1', '1');
    kv.set(
      'billing.demo.entitlement.v1',
      JSON.stringify({ demo: true, plan: 'yearly', startedAt: 1, trialEndsAt: null }),
    );
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    process.env.EXPO_PUBLIC_DEMO_PAYMENTS = '1';
    jest.isolateModules(() => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const m = require('../demoPayments') as typeof import('../demoPayments');
      const b = require('../billing') as typeof import('../billing');
      /* eslint-enable @typescript-eslint/no-require-imports */
      expect(m.DEMO_PAYMENTS_AVAILABLE).toBe(false);
      expect(m.useDemoPayments.getState()).toEqual({ on: false, entitlement: null });
      m.setDemoPaymentsOn(true);
      m.grantDemoEntitlement('yearly', 7);
      expect(m.useDemoPayments.getState()).toEqual({ on: false, entitlement: null });
      expect(m.demoCheckoutActive({ on: true, entitlement: null })).toBe(false);
      expect(m.demoProActive({ demo: true, plan: 'yearly', startedAt: 1, trialEndsAt: null })).toBe(
        false,
      );
      // Even a forced demo state cannot turn payments on or unlock Pro.
      const g = b.proGate(
        true,
        null,
        true,
        { demo: true, plan: 'yearly', startedAt: 1, trialEndsAt: null },
        2,
      );
      expect(g).toEqual({ paymentsOn: true, subscribed: false, demo: false, isPro: false });
      expect(b.proGate(false, null, true, null, 2).paymentsOn).toBe(false);
    });
  });
});
