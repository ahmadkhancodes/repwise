import { create } from 'zustand';

import type { PlanId } from './billingApi';
import { kv } from './storage';

/**
 * DEMO purchase mode (D-DEMO-PAY, owner 22 Nov 2026): a local, clearly-marked TEST checkout for
 * the client video and preview builds. NO store, NO Stripe, NO network.
 *
 * Compile-time gate: `EXPO_PUBLIC_*` values are inlined by babel-preset-expo, so in a production
 * build (`EXPO_PUBLIC_APP_ENV=production`, eas.json) {@link DEMO_PAYMENTS_AVAILABLE} is the literal
 * `false` and every demo branch is dead code. A production build can never show the test checkout
 * or unlock Pro locally; there Pro still comes only from the Worker entitlement.
 */
export function demoPaymentsAvailable(env: {
  appEnv?: string | undefined;
  demo?: string | undefined;
}): boolean {
  return env.appEnv !== 'production' && env.demo !== '0';
}

/** Payments shown without the Worker (`EXPO_PUBLIC_DEMO_PAYMENTS=1`, or a preview build). */
export function demoPaymentsDefaultOn(env: {
  appEnv?: string | undefined;
  demo?: string | undefined;
}): boolean {
  return demoPaymentsAvailable(env) && (env.demo === '1' || env.appEnv === 'preview');
}

const ENV = {
  appEnv: process.env.EXPO_PUBLIC_APP_ENV,
  demo: process.env.EXPO_PUBLIC_DEMO_PAYMENTS,
};

export const DEMO_PAYMENTS_AVAILABLE: boolean = demoPaymentsAvailable(ENV);

/** A local TEST entitlement. Never sent anywhere; never valid in production. */
export type DemoEntitlement = {
  demo: true;
  plan: PlanId;
  startedAt: number;
  /** End of the free trial (yearly), or null when paid straight away. */
  trialEndsAt: number | null;
};

const K = { on: 'billing.demo.on.v1', ent: 'billing.demo.entitlement.v1' } as const;

export function parseDemoEntitlement(raw: string | undefined): DemoEntitlement | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<DemoEntitlement>;
    if (v.demo !== true || typeof v.plan !== 'string' || typeof v.startedAt !== 'number')
      return null;
    return {
      demo: true,
      plan: v.plan,
      startedAt: v.startedAt,
      trialEndsAt: typeof v.trialEndsAt === 'number' ? v.trialEndsAt : null,
    };
  } catch {
    return null;
  }
}

/** Pro from the demo entitlement: only in demo-capable builds. Pure. */
export function demoProActive(
  ent: DemoEntitlement | null,
  available = DEMO_PAYMENTS_AVAILABLE,
): boolean {
  return available && ent?.demo === true;
}

export type DemoPaymentsState = {
  /** Payments (paywall + gates + test checkout) switched on locally. */
  on: boolean;
  entitlement: DemoEntitlement | null;
};

function initial(): DemoPaymentsState {
  if (!DEMO_PAYMENTS_AVAILABLE) return { on: false, entitlement: null };
  const stored = kv.getString(K.on);
  return {
    on: stored === '1' || (stored !== '0' && demoPaymentsDefaultOn(ENV)),
    entitlement: parseDemoEntitlement(kv.getString(K.ent)),
  };
}

export const useDemoPayments = create<DemoPaymentsState>()(() => initial());

/** Switch demo payments on/off (deep link `repwise://demo-payments?on=1`). No-op in production. */
export function setDemoPaymentsOn(on: boolean): void {
  if (!DEMO_PAYMENTS_AVAILABLE) return;
  kv.set(K.on, on ? '1' : '0');
  useDemoPayments.setState({ on });
}

const DAY = 24 * 60 * 60 * 1000;

/** "Payment complete": unlock Pro locally with a TEST entitlement. No-op in production. */
export function grantDemoEntitlement(plan: PlanId, trialDays: number, now = Date.now()): void {
  if (!DEMO_PAYMENTS_AVAILABLE) return;
  const ent: DemoEntitlement = {
    demo: true,
    plan,
    startedAt: now,
    trialEndsAt: trialDays > 0 ? now + trialDays * DAY : null,
  };
  kv.set(K.ent, JSON.stringify(ent));
  useDemoPayments.setState({ entitlement: ent });
}

/** Settings → Subscription → "Reset test purchase". */
export function resetDemoEntitlement(): void {
  kv.remove(K.ent);
  useDemoPayments.setState({ entitlement: null });
}

/** Demo checkout is used instead of the store whenever demo payments are on. */
export function demoCheckoutActive(s: DemoPaymentsState = useDemoPayments.getState()): boolean {
  return DEMO_PAYMENTS_AVAILABLE && s.on;
}

/** Tests only. */
export function resetDemoPaymentsState(): void {
  useDemoPayments.setState(initial(), true);
}
