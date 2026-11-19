/**
 * The contract between billing and the data layer (`src/services/api.ts`, owned by the
 * data/auth agent). Billing never makes HTTP calls itself: it is handed an object that
 * satisfies `BillingApi` via `configureBilling({ api })` and mocks it in tests.
 *
 * Shapes mirror the Worker (server/README.md): `GET /config`, `POST /billing/verify`,
 * `GET /billing/entitlement`.
 */
import { api, isApiError } from './api';
import { ensureSession } from './auth';

export type PlanId = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type BillingPlatform = 'ios' | 'android';

/** Store product ids. iOS: 4 products in one group. Android: 1 subscription, 4 base plans. */
export type ProductIds = {
  ios: Record<PlanId, string>;
  android: { subscriptionId: string; basePlans: Record<PlanId, string> };
};

/** `GET /config` (only the fields billing reads). `plans` is null while payments are off. */
export type RemoteConfig = {
  payments_enabled: boolean;
  plans?: ProductIds | null;
};

/** `GET /billing/entitlement` and the reply of `POST /billing/verify`. */
export type Entitlement = {
  pro: boolean;
  plan: PlanId | null;
  source: 'apple' | 'play' | null;
  /** ms since epoch */
  expiresAt: number | null;
  inTrial: boolean;
  autoRenew: boolean;
  updatedAt: number | null;
};

/** `POST /billing/verify` body: StoreKit 2 JWS on iOS, purchase token + subscription id on Android. */
export type VerifyRequest =
  | { platform: 'ios'; signedTransaction: string }
  | { platform: 'android'; purchaseToken: string; productId: string };

export interface BillingApi {
  /** `GET /config` (no auth). Must reject when offline; billing then uses its cached flag. */
  getConfig(): Promise<RemoteConfig>;
  /**
   * `POST /billing/verify` with the user's access token (an anonymous account is fine).
   * Resolves with the entitlement after the Worker verified the purchase with Apple/Google.
   */
  verifyPurchase(body: VerifyRequest): Promise<Entitlement>;
  /** `GET /billing/entitlement` with the user's access token. */
  getEntitlement(): Promise<Entitlement>;
  /**
   * The server user id (signed-in or anonymous, uuid), creating the anonymous account if
   * needed, or null when offline. Sent as StoreKit `appAccountToken` / Play
   * `obfuscatedAccountId` so store webhooks can find the owner before /billing/verify.
   */
  getAccountId(): Promise<string | null>;
}

/**
 * Throw this from a `BillingApi` method when the Worker answered with a non-2xx status.
 * Anything else that is thrown counts as a network / transient error and is retried.
 */
export class BillingApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string = 'http_error',
  ) {
    super(`billing api ${status} ${code}`);
    this.name = 'BillingApiError';
  }
}

/** 400/403/409/422: the Worker refused this purchase. Retrying the same request will not help. */
export function isPermanentRejection(e: unknown): boolean {
  return e instanceof BillingApiError && [400, 403, 409, 422].includes(e.status);
}

/* ------------------------------------------------- Worker implementation (data layer) */

/**
 * `BillingApi` over `src/services/api.ts` (single-flight refresh, timeouts, offline detection).
 * A non-2xx reply becomes `BillingApiError(status, code)`; offline/timeout/config errors are
 * rethrown as-is, which billing treats as transient. Purchases work before sign-in on the
 * silent anonymous account (sheet 15), created on demand.
 */
export function createWorkerBillingApi(): BillingApi {
  async function call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (isApiError(e) && e.status !== null)
        throw new BillingApiError(e.status, e.code ?? 'http_error');
      throw e;
    }
  }
  return {
    getConfig: () => call(() => api.get<RemoteConfig>('/config')),
    verifyPurchase: (body) =>
      call(async () => {
        await ensureSession();
        return api.post<Entitlement>('/billing/verify', body, { auth: 'required' });
      }),
    getEntitlement: () =>
      call(async () => {
        await ensureSession();
        return api.get<Entitlement>('/billing/entitlement', { auth: 'required' });
      }),
    getAccountId: async () => {
      try {
        return (await ensureSession()).id;
      } catch {
        return null;
      }
    },
  };
}
