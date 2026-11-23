import { AppState, Linking, Platform, type NativeEventSubscription } from 'react-native';
import { create } from 'zustand';

import { DEFAULT_PRODUCT_IDS } from '@/features/billing/config';
import {
  cachedProActive,
  needsRefresh,
  parseCached,
  toCached,
  type CachedEntitlement,
} from '@/features/billing/logic/entitlement';
import { manageSubscriptionUrl } from '@/features/billing/logic/manage';
import {
  androidOffers,
  fallbackOffers,
  iosOffers,
  mergeWithFallback,
  type PlanOffer,
} from '@/features/billing/logic/offers';
import {
  dequeue,
  dueItems,
  enqueue,
  markFailed,
  nextDueAt,
  parseQueue,
  purchaseKey,
  verifyBody,
  type QueuedPurchase,
} from '@/features/billing/logic/queue';

import {
  isPermanentRejection,
  type BillingApi,
  type BillingPlatform,
  type Entitlement,
  type PlanId,
  type ProductIds,
} from './billingApi';
import {
  createIapAdapter,
  classifyStoreError,
  type StoreAdapter,
  type StoreError,
  type StorePurchase,
} from './iap';
import { DEMO_PAYMENTS_AVAILABLE, demoProActive, useDemoPayments } from './demoPayments';
import { kv } from './storage';

/* ------------------------------------------------------------------ state */

const K = {
  enabled: 'billing.paymentsEnabled.v1',
  ids: 'billing.productIds.v1',
  ent: 'billing.entitlement.v1',
  queue: 'billing.queue.v1',
} as const;

export type StoreStatus = 'off' | 'connecting' | 'ready' | 'error';

export type BillingState = {
  /** `GET /config` payments_enabled, cached. false (nobody gated) until the Worker says otherwise. */
  paymentsEnabled: boolean;
  productIds: ProductIds;
  /** The Worker entitlement (cached in MMKV). The ONLY source of Pro. */
  entitlement: CachedEntitlement | null;
  /** Paywall plans: localised from the store, or the USD fallback while loading. */
  offers: PlanOffer[];
  storeStatus: StoreStatus;
  productsStatus: 'idle' | 'loading' | 'ready' | 'error';
  purchasing: PlanId | null;
  restoring: boolean;
  /** Purchases waiting for /billing/verify. */
  queue: QueuedPurchase[];
};

function os(): BillingPlatform {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

function readIds(): ProductIds {
  try {
    const raw = kv.getString(K.ids);
    return raw ? (JSON.parse(raw) as ProductIds) : DEFAULT_PRODUCT_IDS;
  } catch {
    return DEFAULT_PRODUCT_IDS;
  }
}

export function initialBillingState(): BillingState {
  const productIds = readIds();
  return {
    paymentsEnabled: kv.getString(K.enabled) === '1',
    productIds,
    entitlement: parseCached(kv.getString(K.ent)),
    offers: fallbackOffers(os(), productIds),
    storeStatus: 'off',
    productsStatus: 'idle',
    purchasing: null,
    restoring: false,
    queue: parseQueue(kv.getString(K.queue)),
  };
}

export const useBillingStore = create<BillingState>()(() => initialBillingState());

const set = (p: Partial<BillingState>) => useBillingStore.setState(p);
const get = () => useBillingStore.getState();

function saveQueue(queue: QueuedPurchase[]): void {
  set({ queue });
  kv.set(K.queue, JSON.stringify(queue));
}

/* --------------------------------------------------------------- outcomes */

export type PurchaseOutcome =
  | { status: 'pro' }
  /** The Worker verified the purchase but it does not grant Pro (expired / refunded). */
  | { status: 'not_entitled' }
  | { status: 'cancelled' }
  /** Waiting for payment (Play slow card, Ask to Buy). Pro arrives when it completes. */
  | { status: 'pending' }
  /** Paid, but /billing/verify could not be reached; retried automatically. */
  | { status: 'queued' }
  | { status: 'disabled' }
  | { status: 'busy' }
  | { status: 'error'; code: string };

export type RestoreOutcome =
  | { status: 'restored' }
  | { status: 'nothing' }
  | { status: 'queued' }
  | { status: 'disabled' }
  | { status: 'error'; code: string };

export type BillingEvent = 'paywall_view' | 'trial_start' | 'purchase';

export type BillingDeps = {
  /** Implemented by `src/services/api.ts` (data agent). null = no backend: payments stay off. */
  api: BillingApi | null;
  store?: StoreAdapter;
  now?: () => number;
  /** Analytics hook (sheet 23); the analytics service wires PostHog here. */
  track?: (event: BillingEvent, props: Record<string, string | number | boolean>) => void;
  openUrl?: (url: string) => Promise<unknown>;
};

/* ---------------------------------------------------------------- service */

type Waiter = { sku: string; plan: PlanId; resolve: (o: PurchaseOutcome) => void };

/**
 * Billing service (sheet 16): store connection, products, purchase → `/billing/verify` →
 * finish, restore, the offline verify queue and listeners. UI uses the hooks in
 * `src/features/billing/hooks`, never this class or the store library directly.
 */
export class BillingService {
  private readonly api: BillingApi | null;
  private readonly store: StoreAdapter;
  private readonly now: () => number;
  private readonly track: NonNullable<BillingDeps['track']>;
  private readonly openUrl: (url: string) => Promise<unknown>;
  private initPromise: Promise<void> | null = null;
  private storeStarted = false;
  private unsubs: (() => void)[] = [];
  private appState: NativeEventSubscription | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private waiter: Waiter | null = null;
  private inFlight = new Map<string, Promise<'verified' | 'queued' | 'rejected'>>();
  private lastForeground = 0;
  private starting: Promise<void> | null = null;

  constructor(deps: BillingDeps) {
    this.api = deps.api;
    this.store = deps.store ?? createIapAdapter();
    this.now = deps.now ?? Date.now;
    this.track = deps.track ?? (() => undefined);
    this.openUrl = deps.openUrl ?? ((u) => Linking.openURL(u));
  }

  get platform(): BillingPlatform {
    return this.store.platform;
  }

  /** Idempotent. Never blocks the UI: call without awaiting from the root layout. */
  init(): Promise<void> {
    this.initPromise ??= (async () => {
      this.appState = AppState.addEventListener('change', (s) => {
        if (s === 'active') void this.onForeground();
      });
      await this.refreshConfig();
      if (get().paymentsEnabled) await this.startStore();
    })();
    return this.initPromise;
  }

  async teardown(): Promise<void> {
    this.appState?.remove();
    this.appState = null;
    await this.stopStore();
    this.initPromise = null;
  }

  /** `GET /config`. Offline keeps the cached flag. Turning payments off stops the store. */
  async refreshConfig(): Promise<void> {
    if (!this.api) return;
    try {
      const cfg = await this.api.getConfig();
      const enabled = cfg.payments_enabled === true;
      const productIds = cfg.plans ?? DEFAULT_PRODUCT_IDS;
      kv.set(K.enabled, enabled ? '1' : '0');
      kv.set(K.ids, JSON.stringify(productIds));
      const wasEnabled = get().paymentsEnabled;
      set({ paymentsEnabled: enabled, productIds });
      if (get().productsStatus !== 'ready')
        set({ offers: fallbackOffers(this.platform, productIds) });
      if (!enabled && wasEnabled) await this.stopStore();
      if (enabled && !wasEnabled && this.initPromise) await this.startStore();
    } catch {
      // offline: keep the cached flag
    }
  }

  /** `GET /billing/entitlement`. On failure the cache (with offline grace) stays in charge. */
  async refreshEntitlement(): Promise<void> {
    if (!this.api || !get().paymentsEnabled) return;
    try {
      this.setEntitlement(await this.api.getEntitlement());
    } catch {
      // offline / 5xx: keep cache
    }
  }

  async loadProducts(): Promise<void> {
    if (!get().paymentsEnabled || !this.storeStarted) return;
    const ids = get().productIds;
    const fallback = fallbackOffers(this.platform, ids);
    set({ productsStatus: 'loading' });
    try {
      if (this.platform === 'ios') {
        const products = await this.store.fetchSubscriptions(Object.values(ids.ios));
        const eligible = await this.store.introEligible(products);
        const offers = iosOffers(products, ids, eligible);
        set({
          offers: mergeWithFallback(offers, fallback),
          productsStatus: offers.length ? 'ready' : 'error',
        });
      } else {
        const products = await this.store.fetchSubscriptions([ids.android.subscriptionId]);
        const offers = androidOffers(products, ids);
        set({
          offers: mergeWithFallback(offers, fallback),
          productsStatus: offers.length ? 'ready' : 'error',
        });
      }
    } catch {
      set({ offers: fallback, productsStatus: 'error' });
    }
  }

  /** Buy a plan. Resolves once the Worker has verified it (or it is queued / cancelled). */
  async purchase(plan: PlanId): Promise<PurchaseOutcome> {
    if (!get().paymentsEnabled) return { status: 'disabled' };
    if (this.waiter) return { status: 'busy' };
    if (!this.storeStarted) await this.startStore();
    const offer = get().offers.find((o) => o.plan === plan);
    if (!offer || !offer.localised) return { status: 'error', code: 'products_unavailable' };

    const accountId = this.api ? await this.api.getAccountId().catch(() => null) : null;
    const done = new Promise<PurchaseOutcome>((resolve) => {
      this.waiter = { sku: offer.sku, plan, resolve };
    });
    set({ purchasing: plan });
    try {
      await this.store.requestSubscription({
        sku: offer.sku,
        offerToken: offer.offerToken,
        accountId,
      });
    } catch (e) {
      this.handleStoreError(classifyStoreError(e));
    }
    const out = await done;
    set({ purchasing: null });
    if (out.status === 'pro') {
      this.track(offer.trialDays > 0 ? 'trial_start' : 'purchase', { plan });
    }
    return out;
  }

  /** Restore button: re-verify every active store purchase, then re-read the entitlement. */
  async restore(): Promise<RestoreOutcome> {
    if (!get().paymentsEnabled) return { status: 'disabled' };
    if (get().restoring) return { status: 'error', code: 'busy' };
    set({ restoring: true });
    try {
      if (!this.storeStarted) await this.startStore();
      let purchases: StorePurchase[];
      try {
        purchases = await this.store.getAvailablePurchases({ sync: true });
      } catch (e) {
        return { status: 'error', code: classifyStoreError(e).code };
      }
      const ours = purchases.filter((p) => this.isOurs(p) && p.state === 'purchased' && p.token);
      const results: string[] = [];
      for (const p of ours) results.push(await this.verify(this.enqueuePurchase(p)));
      // Also picks up Pro bought on the other platform (the entitlement is per account).
      await this.refreshEntitlement();
      if (cachedProActive(get().entitlement, this.now())) return { status: 'restored' };
      if (results.includes('queued')) return { status: 'queued' };
      return { status: 'nothing' };
    } finally {
      set({ restoring: false });
    }
  }

  /** Retry queued verifications that are due (`force` ignores backoff). */
  async flushQueue(force = false): Promise<void> {
    if (!this.api || !get().paymentsEnabled) return;
    for (const item of dueItems(get().queue, this.now(), force)) await this.verify(item);
  }

  async openManage(): Promise<void> {
    const { entitlement, productIds } = get();
    await this.openUrl(
      manageSubscriptionUrl(this.platform, {
        source: entitlement?.source ?? null,
        subscriptionId: productIds.android.subscriptionId,
      }),
    );
  }

  trackPaywallView(source: string): void {
    this.track('paywall_view', { source });
  }

  /** Demo builds only (D-DEMO-PAY): the TEST checkout finished; marked `demo` so it never counts as revenue. */
  trackDemoPurchase(plan: PlanId, trial: boolean): void {
    this.track(trial ? 'trial_start' : 'purchase', { plan, demo: true });
  }

  /* ------------------------------------------------------------ internals */

  private startStore(): Promise<void> {
    if (this.storeStarted || !get().paymentsEnabled) return Promise.resolve();
    this.starting ??= this.doStartStore().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async doStartStore(): Promise<void> {
    set({ storeStatus: 'connecting' });
    try {
      if (!(await this.store.connect())) throw new Error('not_connected');
    } catch {
      set({ storeStatus: 'error' });
      return;
    }
    this.storeStarted = true;
    this.unsubs = [
      this.store.onPurchase((p) => void this.handlePurchase(p)),
      this.store.onError((e) => this.handleStoreError(e)),
    ];
    set({ storeStatus: 'ready' });
    await Promise.all([
      this.loadProducts(),
      this.recoverUnfinishedAndroid(),
      this.flushQueue(true),
      this.refreshEntitlement(),
    ]);
  }

  private async stopStore(): Promise<void> {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const wasStarted = this.storeStarted;
    this.storeStarted = false;
    if (wasStarted) set({ storeStatus: 'off' });
    if (wasStarted) await this.store.disconnect().catch(() => undefined);
  }

  /**
   * Android does not replay purchases made while the app was killed; unacknowledged ones
   * would be auto-refunded by Play after 3 days, so verify them on start. (iOS replays
   * unfinished transactions through the purchase listener by itself.)
   */
  private async recoverUnfinishedAndroid(): Promise<void> {
    if (this.platform !== 'android') return;
    try {
      const list = await this.store.getAvailablePurchases({ sync: false });
      for (const p of list) {
        if (this.isOurs(p) && p.state === 'purchased' && p.token && p.acknowledged === false) {
          await this.verify(this.enqueuePurchase(p));
        }
      }
    } catch {
      // store hiccup: retried next launch
    }
  }

  private isOurs(p: StorePurchase): boolean {
    const ids = get().productIds;
    return p.platform === 'ios'
      ? Object.values(ids.ios).includes(p.productId)
      : p.productId === ids.android.subscriptionId;
  }

  private enqueuePurchase(p: StorePurchase): QueuedPurchase {
    const q = enqueue(get().queue, p, this.now());
    saveQueue(q);
    return q.find((x) => x.key === purchaseKey(p.platform, p.transactionId, p.token))!;
  }

  private resolveWaiter(productId: string | undefined, out: PurchaseOutcome): void {
    const w = this.waiter;
    if (!w || (productId && productId !== w.sku)) return;
    this.waiter = null;
    w.resolve(out);
  }

  private async handlePurchase(p: StorePurchase): Promise<void> {
    if (!this.isOurs(p)) return;
    if (p.state === 'pending') {
      this.resolveWaiter(p.productId, { status: 'pending' });
      return;
    }
    if (p.state !== 'purchased' || !p.token) {
      this.resolveWaiter(p.productId, { status: 'error', code: 'invalid_purchase' });
      return;
    }
    const result = await this.verify(this.enqueuePurchase(p));
    const out: PurchaseOutcome =
      result === 'verified'
        ? cachedProActive(get().entitlement, this.now())
          ? { status: 'pro' }
          : { status: 'not_entitled' }
        : result === 'queued'
          ? { status: 'queued' }
          : { status: 'error', code: 'rejected' };
    this.resolveWaiter(p.productId, out);
  }

  private handleStoreError(e: StoreError): void {
    if (e.kind === 'already_owned') {
      // Owned on this store account already: restore links it to this account.
      void this.restore().then((r) =>
        this.resolveWaiter(
          e.productId,
          r.status === 'restored' ? { status: 'pro' } : { status: 'error', code: e.code },
        ),
      );
      return;
    }
    const out: PurchaseOutcome =
      e.kind === 'cancelled'
        ? { status: 'cancelled' }
        : e.kind === 'pending'
          ? { status: 'pending' }
          : { status: 'error', code: e.code };
    this.resolveWaiter(e.productId, out);
  }

  /**
   * `/billing/verify`, then finish. The transaction is finished ONLY after the Worker
   * accepted it; on a network error it stays unfinished and queued for retry.
   */
  private verify(item: QueuedPurchase): Promise<'verified' | 'queued' | 'rejected'> {
    const running = this.inFlight.get(item.key);
    if (running) return running;
    const run = (async (): Promise<'verified' | 'queued' | 'rejected'> => {
      if (!this.api) return 'queued';
      try {
        this.setEntitlement(await this.api.verifyPurchase(verifyBody(item)));
      } catch (e) {
        if (isPermanentRejection(e)) {
          // The Worker refused it (unknown product, invalid token). Do not loop on it and do
          // not finish it: Play refunds unacknowledged purchases, StoreKit replays it next launch.
          saveQueue(dequeue(get().queue, item.key));
          return 'rejected';
        }
        saveQueue(
          markFailed(get().queue, item.key, this.now(), e instanceof Error ? e.message : 'error'),
        );
        this.scheduleRetry();
        return 'queued';
      }
      saveQueue(dequeue(get().queue, item.key));
      try {
        await this.store.finish({
          platform: item.platform,
          productId: item.productId,
          transactionId: item.transactionId,
          token: item.token,
          state: 'purchased',
        });
      } catch {
        // Already finished / acknowledged by the Worker. iOS replays it if not, and
        // verify is idempotent.
      }
      return 'verified';
    })().finally(() => this.inFlight.delete(item.key));
    this.inFlight.set(item.key, run);
    return run;
  }

  private scheduleRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const at = nextDueAt(get().queue);
    if (at == null) return;
    this.retryTimer = setTimeout(
      () => {
        this.retryTimer = null;
        void this.flushQueue();
      },
      Math.max(1_000, at - this.now()),
    );
  }

  private setEntitlement(e: Entitlement): void {
    const c = toCached(e, this.now());
    kv.set(K.ent, JSON.stringify(c));
    set({ entitlement: c });
  }

  private async onForeground(): Promise<void> {
    const now = this.now();
    if (now - this.lastForeground < 60_000) return;
    this.lastForeground = now;
    await this.refreshConfig();
    if (!get().paymentsEnabled) return;
    await this.flushQueue(true);
    if (needsRefresh(get().entitlement, this.now())) await this.refreshEntitlement();
  }
}

/* -------------------------------------------------------------- singleton */

let service: BillingService = new BillingService({ api: null });

/**
 * Wire billing to the data layer (call once from the root layout, then `billing().init()`).
 * Until this is called, payments are off: nobody is gated and nothing calls the store.
 */
export function configureBilling(deps: BillingDeps): BillingService {
  void service.teardown();
  service = new BillingService(deps);
  return service;
}

export function billing(): BillingService {
  return service;
}

/** Pro gate for non-React code: true for everyone while payments are off. */
export function isProNow(now = Date.now()): boolean {
  const s = get();
  const demo = useDemoPayments.getState();
  return proGate(s.paymentsEnabled, s.entitlement, demo.on, demo.entitlement, now).isPro;
}

/**
 * The one Pro rule, shared by `usePro` and {@link isProNow}. Pure. Payments are on when the
 * Worker says so or (demo builds only) demo payments are on; Pro = the Worker entitlement, or
 * (demo builds only) the local TEST entitlement. In production the demo inputs are always off.
 */
export function proGate(
  paymentsEnabled: boolean,
  entitlement: CachedEntitlement | null,
  demoOn: boolean,
  demoEntitlement: Parameters<typeof demoProActive>[0],
  now: number,
): { paymentsOn: boolean; subscribed: boolean; demo: boolean; isPro: boolean } {
  const demoPayments = DEMO_PAYMENTS_AVAILABLE && demoOn;
  const paymentsOn = paymentsEnabled || demoPayments;
  const real = paymentsEnabled && cachedProActive(entitlement, now);
  const demo = demoPayments && demoProActive(demoEntitlement);
  const subscribed = real || demo;
  return { paymentsOn, subscribed, demo: demo && !real, isPro: !paymentsOn || subscribed };
}

/** Tests only: fresh state from storage. */
export function resetBillingState(): void {
  useBillingStore.setState(initialBillingState(), true);
}
