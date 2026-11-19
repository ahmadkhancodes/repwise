import type {
  PricingPhaseAndroid,
  ProductSubscription,
  SubscriptionOffer,
  SubscriptionPeriod,
} from 'react-native-iap';

import type { BillingPlatform, PlanId, ProductIds } from '@/services/billingApi';

import { PLANS, perWeek } from '../plans';

/** One purchasable plan as the paywall shows it. Pure data. */
export type PlanOffer = {
  plan: PlanId;
  /** iOS product id, or the Android subscription id. */
  sku: string;
  /** Android only: base plan + offer token to pass to Play Billing. */
  basePlanId?: string;
  offerToken?: string;
  /** Localised recurring price ("£45.99"), or the USD fallback while loading. */
  price: string;
  amount: number | null;
  currency: string | null;
  /** Free-trial days this user is eligible for (0 = none). */
  trialDays: number;
  perWeek: string | null;
  /** false = static fallback (store not loaded yet); not purchasable. */
  localised: boolean;
};

const UNIT_DAYS: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };

/** ISO 8601 period ("P7D", "P1W", "P1M") → days. Pure. */
export function isoPeriodDays(iso: string): number {
  const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/.exec(iso.trim());
  if (!m) return 0;
  const [, y, mo, w, d] = m.map((v) => Number(v ?? 0));
  return (y ?? 0) * 365 + (mo ?? 0) * 30 + (w ?? 0) * 7 + (d ?? 0);
}

function periodDays(p: SubscriptionPeriod | null | undefined): number {
  return p ? (UNIT_DAYS[p.unit] ?? 0) * p.value : 0;
}

/** Static USD offers from sheet 05, shown while the store loads or is unreachable. */
export function fallbackOffers(platform: BillingPlatform, ids: ProductIds): PlanOffer[] {
  return PLANS.map((p) => ({
    plan: p.id,
    sku: platform === 'ios' ? ids.ios[p.id] : ids.android.subscriptionId,
    ...(platform === 'android' ? { basePlanId: ids.android.basePlans[p.id] } : {}),
    price: p.price,
    amount: p.amount,
    currency: 'USD',
    trialDays: p.trialDays,
    perWeek: perWeek(p.id, p.amount, 'USD'),
    localised: false,
  }));
}

/**
 * iOS: 4 products in one group. The trial is the product's introductory free-trial offer,
 * shown only when StoreKit says this Apple ID is still eligible (no misleading trial claims).
 */
export function iosOffers(
  products: readonly ProductSubscription[],
  ids: ProductIds,
  introEligible: boolean,
): PlanOffer[] {
  const out: PlanOffer[] = [];
  for (const p of PLANS) {
    const product = products.find((x) => x.id === ids.ios[p.id] && x.platform === 'ios');
    if (!product || product.platform !== 'ios') continue;
    let trialDays = 0;
    if (introEligible) {
      const intro = (product.subscriptionOffers ?? []).find(
        (o: SubscriptionOffer) => o.type === 'introductory' && o.paymentMode === 'free-trial',
      );
      if (intro) {
        trialDays =
          periodDays(intro.period) *
          Math.max(1, intro.periodCount ?? intro.numberOfPeriodsIOS ?? 1);
      } else if (product.introductoryPricePaymentModeIOS === 'free-trial') {
        const unit = product.introductoryPriceSubscriptionPeriodIOS ?? 'empty';
        const n = Number(product.introductoryPriceNumberOfPeriodsIOS ?? 1) || 1;
        trialDays = (UNIT_DAYS[unit] ?? 0) * n;
      }
    }
    const amount = typeof product.price === 'number' ? product.price : null;
    out.push({
      plan: p.id,
      sku: product.id,
      price: product.displayPrice,
      amount,
      currency: product.currency || null,
      trialDays,
      perWeek: perWeek(p.id, amount, product.currency),
      localised: true,
    });
  }
  return out;
}

type Phases = PricingPhaseAndroid[];

function phasesOf(o: SubscriptionOffer): Phases {
  return o.pricingPhasesAndroid?.pricingPhaseList ?? [];
}

/** Days of a leading free phase ("P7D" × cycles), 0 when the offer starts paid. */
function freeTrialDays(phases: Phases): number {
  const first = phases[0];
  if (!first || phases.length < 2 || Number(first.priceAmountMicros) !== 0) return 0;
  return isoPeriodDays(first.billingPeriod) * Math.max(1, first.billingCycleCount);
}

/** The recurring (full) price phase: INFINITE_RECURRING (1), else the last phase. */
function recurringPhase(phases: Phases): PricingPhaseAndroid | undefined {
  return phases.find((ph) => ph.recurrenceMode === 1) ?? phases[phases.length - 1];
}

/**
 * Android: one subscription (`repwise_pro`) with 4 base plans. Play only returns offers this
 * account is eligible for, so a free-trial offer on the yearly base plan means the trial applies.
 */
export function androidOffers(
  products: readonly ProductSubscription[],
  ids: ProductIds,
): PlanOffer[] {
  const product = products.find(
    (x) => x.id === ids.android.subscriptionId && x.platform === 'android',
  );
  if (!product) return [];
  const all = product.subscriptionOffers ?? [];
  const out: PlanOffer[] = [];
  for (const p of PLANS) {
    const basePlanId = ids.android.basePlans[p.id];
    const candidates = all.filter(
      (o) => o.basePlanIdAndroid === basePlanId && o.offerTokenAndroid && phasesOf(o).length > 0,
    );
    if (candidates.length === 0) continue;
    // Trial offer first (longest trial), else the plain base plan (fewest phases).
    const best = [...candidates].sort((a, b) => {
      const t = freeTrialDays(phasesOf(b)) - freeTrialDays(phasesOf(a));
      return t !== 0 ? t : phasesOf(a).length - phasesOf(b).length;
    })[0]!;
    const phases = phasesOf(best);
    const rec = recurringPhase(phases)!;
    const amount = Number(rec.priceAmountMicros) / 1_000_000;
    const currency = rec.priceCurrencyCode || null;
    out.push({
      plan: p.id,
      sku: product.id,
      basePlanId,
      offerToken: best.offerTokenAndroid ?? undefined,
      price: rec.formattedPrice,
      amount: Number.isFinite(amount) ? amount : null,
      currency,
      trialDays: freeTrialDays(phases),
      perWeek: perWeek(p.id, Number.isFinite(amount) ? amount : null, currency),
      localised: true,
    });
  }
  return out;
}

/** Store offers when every plan loaded, else the static fallback for the missing plans. */
export function mergeWithFallback(store: PlanOffer[], fallback: PlanOffer[]): PlanOffer[] {
  return fallback.map((f) => store.find((s) => s.plan === f.plan) ?? f);
}
