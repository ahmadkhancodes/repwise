import type { Env } from './env';

export type Plan = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export const PLANS: readonly Plan[] = ['weekly', 'monthly', 'quarterly', 'yearly'];
export type AiKind = 'plan_week' | 'meals_day' | 'swap';
export const AI_KINDS: readonly AiKind[] = ['plan_week', 'meals_day', 'swap'];

export interface PlansConfig {
  /** App Store product id → plan (one subscription group, 4 products). */
  ios: Record<Plan, string>;
  /** Play: one subscription with 4 base plans. */
  android: { subscriptionId: string; basePlans: Record<Plan, string> };
}

/** USD per million tokens. `long*` rates apply when the prompt exceeds `longThreshold` tokens. */
export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  longThreshold?: number;
  longInput?: number;
  longOutput?: number;
  longCacheRead?: number;
  longCacheWrite?: number;
}

export type AiLimits = Record<'free' | 'pro', Record<AiKind, number>>;

export interface Config {
  environment: string;
  jwt: { secret: string; issuer: string; audience: string; accessTtlSec: number; refreshTtlMs: number };
  google: { audiences: string[] };
  apple: { audiences: string[]; bundleId: string; rootCaB64: string; issuerId: string; keyId: string; privateKey: string };
  play: { packageName: string; serviceAccountJson: string; rtdnSecret: string; pubsubAudience: string; pubsubServiceAccount: string };
  mail: { provider: string; from: string; resendKey: string };
  paymentsEnabled: boolean;
  plans: PlansConfig;
  ai: {
    provider: string;
    model: string;
    apiKey: string;
    monthlyBudgetUsd: number;
    prices: Record<string, ModelPrice>;
    limits: AiLimits;
    timeoutMs: number;
    adminToken: string;
  };
  features: Record<string, boolean | string | number>;
  corsOrigins: string[];
}

export const DEFAULT_PLANS: PlansConfig = {
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

/**
 * Anthropic first-party prices (USD / 1M tokens), from the claude-api reference cached 2026-11-03.
 * Cache reads 0.1x input, 5-minute cache writes 1.25x input. Override with AI_PRICES_JSON.
 */
export const DEFAULT_PRICES: Record<string, ModelPrice> = {
  'claude-haiku-5-5': {
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    cacheWrite: 0.125,
    longThreshold: 100_000,
    longInput: 0.5,
    longOutput: 2.5,
    longCacheRead: 0.05,
    longCacheWrite: 0.625,
  },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};

export const DEFAULT_AI_LIMITS: AiLimits = {
  free: { plan_week: 2, meals_day: 3, swap: 10 },
  pro: { plan_week: 6, meals_day: 10, swap: 40 },
};

function json<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.warn('config: ignoring malformed JSON variable');
    return fallback;
  }
}

function list(...vals: (string | undefined)[]): string[] {
  return vals
    .flatMap((v) => (v ?? '').split(','))
    .map((s) => s.trim())
    .filter(Boolean);
}

function num(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return raw !== undefined && raw !== '' && Number.isFinite(n) ? n : fallback;
}

export function loadConfig(env: Env): Config {
  const bundleId = env.APPLE_BUNDLE_ID || 'com.client.repwise';
  const plansOverride = json<Partial<PlansConfig>>(env.PLANS_JSON, {});
  const limitsOverride = json<Partial<AiLimits>>(env.AI_LIMITS_JSON, {});
  return {
    environment: env.ENVIRONMENT || 'production',
    jwt: {
      secret: env.JWT_SECRET ?? '',
      issuer: env.JWT_ISSUER || 'repwise-api',
      audience: env.JWT_AUDIENCE || 'repwise-app',
      accessTtlSec: 15 * 60,
      refreshTtlMs: 60 * 24 * 3600 * 1000,
    },
    google: { audiences: list(env.GOOGLE_WEB_CLIENT_ID, env.GOOGLE_IOS_CLIENT_ID, env.GOOGLE_ANDROID_CLIENT_ID) },
    apple: {
      audiences: list(bundleId, env.APPLE_SERVICES_ID),
      bundleId,
      rootCaB64: env.APPLE_ROOT_CA_G3_B64 ?? '',
      issuerId: env.APPLE_ISSUER_ID ?? '',
      keyId: env.APPLE_KEY_ID ?? '',
      privateKey: env.APPLE_PRIVATE_KEY ?? '',
    },
    play: {
      packageName: env.PLAY_PACKAGE_NAME || 'com.client.repwise',
      serviceAccountJson: env.PLAY_SERVICE_ACCOUNT_JSON ?? '',
      rtdnSecret: env.PLAY_RTDN_SECRET ?? '',
      pubsubAudience: env.PLAY_PUBSUB_AUDIENCE ?? '',
      pubsubServiceAccount: env.PLAY_PUBSUB_SERVICE_ACCOUNT ?? '',
    },
    mail: { provider: env.MAIL_PROVIDER || 'console', from: env.MAIL_FROM || 'Repwise <login@repwise.app>', resendKey: env.RESEND_API_KEY ?? '' },
    paymentsEnabled: env.PAYMENTS_ENABLED === 'true',
    plans: {
      ios: { ...DEFAULT_PLANS.ios, ...(plansOverride.ios ?? {}) },
      android: {
        subscriptionId: plansOverride.android?.subscriptionId ?? DEFAULT_PLANS.android.subscriptionId,
        basePlans: { ...DEFAULT_PLANS.android.basePlans, ...(plansOverride.android?.basePlans ?? {}) },
      },
    },
    ai: {
      provider: (env.AI_PROVIDER || 'anthropic').toLowerCase(),
      model: env.AI_MODEL || 'claude-haiku-5-5',
      apiKey: env.ANTHROPIC_API_KEY ?? '',
      monthlyBudgetUsd: num(env.AI_MONTHLY_BUDGET_USD, 50),
      prices: { ...DEFAULT_PRICES, ...json<Record<string, ModelPrice>>(env.AI_PRICES_JSON, {}) },
      limits: {
        free: { ...DEFAULT_AI_LIMITS.free, ...(limitsOverride.free ?? {}) },
        pro: { ...DEFAULT_AI_LIMITS.pro, ...(limitsOverride.pro ?? {}) },
      },
      timeoutMs: num(env.AI_TIMEOUT_MS, 8000),
      adminToken: env.AI_ADMIN_TOKEN ?? '',
    },
    features: {
      sync_enabled: true,
      google_login: true,
      apple_login: true,
      email_login: true,
      ...json<Record<string, boolean | string | number>>(env.FEATURE_FLAGS_JSON, {}),
    },
    corsOrigins: list(env.CORS_ORIGINS),
  };
}

export function planForAppleProduct(cfg: Config, productId: string): Plan | null {
  return PLANS.find((p) => cfg.plans.ios[p] === productId) ?? null;
}

export function planForPlayBasePlan(cfg: Config, productId: string, basePlanId: string | null | undefined): Plan | null {
  if (productId !== cfg.plans.android.subscriptionId || !basePlanId) return null;
  return PLANS.find((p) => cfg.plans.android.basePlans[p] === basePlanId) ?? null;
}
