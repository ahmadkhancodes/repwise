import { Redirect, router, useLocalSearchParams } from 'expo-router';
import {
  Ban,
  Bell,
  CalendarDays,
  Dumbbell,
  TrendingUp,
  Utensils,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { billing, type PurchaseOutcome, type RestoreOutcome } from '@/services/billing';
import { useTheme } from '@/theme';
import { Badge, Button, IconButton, PressableScale, Screen, showToast, Text, TickMark } from '@/ui';
import { enterAt } from '@/ui/listMotion';

import { LEGAL_URLS } from '../config';
import { useBilling } from '../hooks/useBilling';
import { paywallHeadline } from '../logic/headline';
import type { PlanOffer } from '../logic/offers';
import { cancelInstructions, storeName } from '../logic/manage';
import { trialTimeline, type TimelineStep } from '../logic/timeline';
import { ctaLabel, DEFAULT_PLAN, planById, priceLine, type PlanId } from '../plans';

const BENEFITS: { icon: LucideIcon; text: string }[] = [
  { icon: Dumbbell, text: 'Workouts that adapt every week' },
  { icon: Utensils, text: 'A daily meal plan in your cuisine' },
  { icon: Bell, text: 'Meal and workout reminders' },
  { icon: TrendingUp, text: 'Full progress history' },
  { icon: Ban, text: 'No ads, ever' },
];

const BADGE: Record<NonNullable<ReturnType<typeof planById>['badge']>, string> = {
  best_value: 'Best value',
  popular: 'Popular',
};

/** "$1.15/week · 7 days free" under the plan name. Pure. */
export function planSubtitle(o: PlanOffer): string | null {
  const parts: string[] = [];
  if (o.plan !== 'weekly' && o.perWeek) parts.push(`${o.perWeek}/week`);
  if (o.trialDays > 0) parts.push(`${o.trialDays} days free`);
  return parts.length ? parts.join(' · ') : null;
}

function purchaseMessage(
  o: PurchaseOutcome,
): { message: string; tone?: 'success' | 'danger' } | null {
  switch (o.status) {
    case 'pro':
      return { message: 'Welcome to Repwise Pro.', tone: 'success' };
    case 'pending':
      return { message: 'Payment pending. Pro unlocks as soon as it goes through.' };
    case 'queued':
      return { message: "Purchase received. Pro unlocks as soon as you're back online." };
    case 'not_entitled':
      return { message: 'This subscription is no longer active.', tone: 'danger' };
    case 'error':
      return { message: "The purchase didn't complete. Please try again.", tone: 'danger' };
    default:
      return null; // cancelled / busy / disabled: say nothing
  }
}

export function restoreMessage(o: RestoreOutcome): {
  message: string;
  tone?: 'success' | 'danger';
} {
  switch (o.status) {
    case 'restored':
      return { message: 'Repwise Pro restored.', tone: 'success' };
    case 'nothing':
      return { message: 'No active subscription found for this account.' };
    case 'queued':
      return { message: "We'll finish restoring when you're back online." };
    case 'disabled':
      return { message: 'Purchases are not available right now.' };
    default:
      return { message: "Couldn't reach the store. Please try again.", tone: 'danger' };
  }
}

/** One paywall plan as a radio row: radio dot, 2dp accent border when selected, badge. */
function PlanRow({
  offer,
  selected,
  onSelect,
}: {
  offer: PlanOffer;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTheme();
  const plan = planById(offer.plan);
  const sub = planSubtitle(offer);
  return (
    <PressableScale
      testID={`plan-${offer.plan}`}
      onPress={onSelect}
      feedback="selection"
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={[
        `${plan.title}, ${offer.price} per ${plan.period}`,
        sub,
        plan.badge ? BADGE[plan.badge] : null,
      ]
        .filter(Boolean)
        .join(', ')}
      style={{
        minHeight: t.sizes.hitGymLarge,
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.sm,
        paddingHorizontal: t.spacing.card,
        paddingVertical: t.spacing.sm,
        borderRadius: t.radius.card,
        borderWidth: t.sizes.borderThick,
        borderColor: selected ? t.colors.accent : t.colors.borderStrong,
        backgroundColor: selected ? t.colors.accentSoft : t.colors.surface,
      }}
    >
      <TickMark checked={selected} shape="circle" />
      <View style={{ flex: 1, gap: t.spacing.xxs }}>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: t.spacing.xs,
          }}
        >
          <Text variant="headline">{plan.title}</Text>
          {plan.badge ? (
            <Badge
              label={BADGE[plan.badge]}
              tone={plan.badge === 'best_value' ? 'inverse' : 'accent'}
            />
          ) : null}
        </View>
        {sub ? (
          <Text
            variant="callout"
            color={offer.trialDays > 0 ? 'accentText' : 'textSecondary'}
            tabular
          >
            {sub}
          </Text>
        ) : null}
      </View>
      <Text variant="headline" tabular testID={`plan-${offer.plan}-price`}>
        {offer.price}
      </Text>
    </PressableScale>
  );
}

/** Trial timeline: Today → reminder → billed, a vertical track with dots (sheet 05 honesty). */
function TrialTimeline({ steps }: { steps: TimelineStep[] }) {
  const t = useTheme();
  const dot = t.spacing.md;
  return (
    <View
      testID="paywall-timeline"
      accessible
      accessibilityLabel={steps.map((s) => `${s.day}: ${s.title}. ${s.body}`).join(' ')}
      style={{
        backgroundColor: t.colors.surface,
        borderRadius: t.radius.card,
        padding: t.spacing.card,
      }}
    >
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <View key={s.key} style={{ flexDirection: 'row', gap: t.spacing.sm }}>
            <View style={{ alignItems: 'center', width: dot }}>
              <View
                style={{
                  width: dot,
                  height: dot,
                  marginTop: t.spacing.xxs,
                  borderRadius: t.radius.pill,
                  backgroundColor: i === 0 ? t.colors.accent : t.colors.inverse,
                }}
              />
              {last ? null : (
                <View
                  style={{
                    flex: 1,
                    width: t.sizes.borderThick,
                    backgroundColor: t.colors.borderStrong,
                  }}
                />
              )}
            </View>
            <View
              style={{ flex: 1, gap: t.spacing.xxs / 2, paddingBottom: last ? 0 : t.spacing.md }}
            >
              <Text variant="eyebrow" color="textSecondary" tabular>
                {s.day}
              </Text>
              <Text variant="headline" tabular>
                {s.title}
              </Text>
              <Text variant="callout" color="textSecondary">
                {s.body}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/**
 * S37 Paywall (modal, sheet 05/10/16). Close is visible immediately; closing = Free mode. The
 * pinned footer holds only the CTA and the plain price line; restore, terms and privacy sit at
 * the end of the scroll so the plans get the room.
 */
export function PaywallScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ source?: string; name?: string }>();
  const reduceMotion = useReducedMotion();
  const b = useBilling();
  const [selected, setSelected] = useState<PlanId>(DEFAULT_PLAN);

  useEffect(() => {
    if (b.paymentsEnabled) billing().trackPaywallView(params.source ?? 'direct');
  }, [b.paymentsEnabled, params.source]);

  // Payments off: the paywall never opens.
  if (!b.paymentsEnabled) return <Redirect href="/" />;

  const offer = b.offers.find((o) => o.plan === selected) ?? b.offers[0]!;
  const loading =
    !offer.localised && (b.productsStatus === 'loading' || b.storeStatus === 'connecting');
  const busy = b.purchasing !== null || b.restoring;
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const plan = planById(offer.plan);
  const timeline = trialTimeline(offer.trialDays, `${offer.price}/${plan.period}`);

  const onBuy = async () => {
    const out = await b.purchase(selected);
    const msg = purchaseMessage(out);
    // The success toast is the purchase's one success buzz.
    if (msg) showToast(msg);
    if (out.status === 'pro') close();
  };

  const onRestore = async () => {
    const out = await b.restore();
    showToast(restoreMessage(out));
    if (out.status === 'restored') close();
  };

  const header = paywallHeadline(params.source, params.name);

  return (
    // One hero title (N7): no Screen title above it; the eyebrow names the product.
    <Screen
      testID="screen-paywall"
      headerLeft={
        <IconButton icon={X} accessibilityLabel="Close" onPress={close} testID="paywall-close" />
      }
      footer={
        <View style={{ gap: t.spacing.xs }}>
          <Button
            label={ctaLabel(offer.trialDays)}
            accent
            onPress={onBuy}
            loading={b.purchasing !== null || loading}
            disabled={!offer.localised || busy}
            accessibilityHint={priceLine(offer)}
            testID="paywall-cta"
          />
          <Text
            variant="callout"
            color="textPrimary"
            align="center"
            tabular
            testID="paywall-price-line"
          >
            {priceLine(offer)}
          </Text>
        </View>
      }
    >
      <Animated.View entering={enterAt(0, reduceMotion)} style={{ gap: t.spacing.sm }}>
        <View style={{ gap: t.spacing.xxs }}>
          <Text variant="eyebrow" color="accentText" testID="paywall-eyebrow">
            Repwise Pro
          </Text>
          <Text variant="title1" accessibilityRole="header" testID="paywall-title">
            {header}
          </Text>
        </View>
        <View style={{ gap: t.spacing.xs }}>
          {BENEFITS.map(({ icon: Icon, text }) => (
            <View
              key={text}
              style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}
            >
              <View
                style={{
                  width: t.spacing.xxxl,
                  height: t.spacing.xxxl,
                  borderRadius: t.radius.pill,
                  backgroundColor: t.colors.accentSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon
                  color={t.colors.accentText}
                  size={t.sizes.iconSmall}
                  strokeWidth={t.sizes.iconStrokeBold}
                />
              </View>
              <Text variant="body" style={{ flex: 1 }}>
                {text}
              </Text>
            </View>
          ))}
        </View>
      </Animated.View>

      {b.productsStatus === 'error' ? (
        <View style={{ gap: t.spacing.xs }} testID="paywall-store-error">
          <Text variant="callout" color="textSecondary">
            {`Couldn't load prices from ${storeName(b.platform)}. Check your connection.`}
          </Text>
          <Button label="Try again" variant="secondary" onPress={() => void b.reloadProducts()} />
        </View>
      ) : null}

      <Animated.View entering={enterAt(1, reduceMotion)}>
        <View
          style={{ gap: t.spacing.xs }}
          accessibilityRole="radiogroup"
          accessibilityLabel="Plans"
        >
          {b.offers.map((o) => (
            <PlanRow
              key={o.plan}
              offer={o}
              selected={o.plan === selected}
              onSelect={() => setSelected(o.plan)}
            />
          ))}
        </View>
      </Animated.View>
      {loading ? (
        <Text variant="caption" color="textSecondary" testID="paywall-loading">
          {`Loading prices from ${storeName(b.platform)}…`}
        </Text>
      ) : null}

      {timeline.length ? (
        <Animated.View entering={enterAt(2, reduceMotion)} style={{ gap: t.spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}>
            <CalendarDays
              color={t.colors.textPrimary}
              size={t.sizes.iconMedium}
              strokeWidth={t.sizes.iconStroke}
            />
            <Text variant="headline">How your free trial works</Text>
          </View>
          <TrialTimeline steps={timeline} />
        </Animated.View>
      ) : null}

      <View style={{ gap: t.spacing.xs, paddingTop: t.spacing.sm }}>
        {offer.trialDays > 0 ? (
          <Text variant="caption" color="textSecondary" align="center">
            {"We'll remind you 2 days before your trial ends."}
          </Text>
        ) : null}
        <Text variant="caption" color="textSecondary" align="center" testID="paywall-cancel">
          {cancelInstructions(b.platform)}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Button
            label="Restore purchases"
            variant="tertiary"
            onPress={onRestore}
            loading={b.restoring}
            disabled={busy}
            testID="paywall-restore"
          />
          <Button
            label="Terms"
            variant="tertiary"
            onPress={() => void Linking.openURL(LEGAL_URLS.terms)}
            accessibilityHint="Opens the terms of use in your browser"
            testID="paywall-terms"
          />
          <Button
            label="Privacy"
            variant="tertiary"
            onPress={() => void Linking.openURL(LEGAL_URLS.privacy)}
            accessibilityHint="Opens the privacy policy in your browser"
            testID="paywall-privacy"
          />
        </View>
      </View>
    </Screen>
  );
}
