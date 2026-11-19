import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Check, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';

import { billing, type PurchaseOutcome, type RestoreOutcome } from '@/services/billing';
import { haptics } from '@/services/haptics';
import { useTheme } from '@/theme';
import { Button, Card, IconButton, Screen, showToast, Text } from '@/ui';

import { LEGAL_URLS } from '../config';
import { useBilling } from '../hooks/useBilling';
import type { PlanOffer } from '../logic/offers';
import { cancelInstructions, storeName } from '../logic/manage';
import { ctaLabel, DEFAULT_PLAN, planById, priceLine, type PlanId } from '../plans';

const BENEFITS = [
  'AI workouts that adapt every week',
  'Daily meal plan in your cuisine',
  'Meal & workout reminders',
  'Progress tracking',
  'No ads',
] as const;

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

/** S37 Paywall (modal, sheet 05/10/16). Close is visible immediately; closing = Free mode. */
export function PaywallScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ source?: string; name?: string }>();
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

  const onBuy = async () => {
    haptics.light();
    const out = await b.purchase(selected);
    const msg = purchaseMessage(out);
    if (msg) showToast(msg);
    if (out.status === 'pro') {
      haptics.success();
      close();
    }
  };

  const onRestore = async () => {
    const out = await b.restore();
    showToast(restoreMessage(out));
    if (out.status === 'restored') close();
  };

  const header = params.name ? `Your plan is ready, ${params.name}.` : 'Your plan is ready.';

  return (
    <Screen
      title="Repwise Pro"
      testID="screen-paywall"
      headerLeft={
        <IconButton icon={X} accessibilityLabel="Close" onPress={close} testID="paywall-close" />
      }
      footer={
        <>
          <Button
            label={ctaLabel(offer.trialDays)}
            accent
            onPress={onBuy}
            loading={b.purchasing !== null || loading}
            disabled={!offer.localised || busy}
            accessibilityHint={priceLine(offer)}
            testID="paywall-cta"
          />
          <Text variant="callout" color="textPrimary" align="center" testID="paywall-price-line">
            {priceLine(offer)}
          </Text>
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
              label="Restore"
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
        </>
      }
    >
      <Text variant="title2" accessibilityRole="header">
        {header}
      </Text>
      <View style={{ gap: t.spacing.xs }}>
        {BENEFITS.map((line) => (
          <View
            key={line}
            style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}
          >
            <Check
              color={t.colors.accentText}
              size={t.sizes.iconSmall}
              strokeWidth={t.sizes.iconStroke}
            />
            <Text variant="body" color="textSecondary" style={{ flex: 1 }}>
              {line}
            </Text>
          </View>
        ))}
      </View>

      {b.productsStatus === 'error' ? (
        <View style={{ gap: t.spacing.xs }} testID="paywall-store-error">
          <Text variant="callout" color="textSecondary">
            {`Couldn't load prices from ${storeName(b.platform)}. Check your connection.`}
          </Text>
          <Button label="Try again" variant="secondary" onPress={() => void b.reloadProducts()} />
        </View>
      ) : null}

      <View style={{ gap: t.spacing.xs }} accessibilityRole="radiogroup" accessibilityLabel="Plans">
        {b.offers.map((o) => {
          const plan = planById(o.plan);
          const sub = planSubtitle(o);
          return (
            <Card
              key={o.plan}
              selected={o.plan === selected}
              onPress={() => {
                haptics.selection();
                setSelected(o.plan);
              }}
              accessibilityLabel={[`${plan.title}, ${o.price} per ${plan.period}`, sub]
                .filter(Boolean)
                .join(', ')}
              testID={`plan-${o.plan}`}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
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
                      <View
                        style={{
                          backgroundColor: t.colors.accentSoft,
                          borderRadius: t.radius.pill,
                          paddingHorizontal: t.spacing.xs,
                          paddingVertical: t.spacing.xxs,
                        }}
                      >
                        <Text variant="caption" color="accentText">
                          {BADGE[plan.badge]}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {sub ? (
                    <Text
                      variant="callout"
                      color={o.trialDays > 0 ? 'accentText' : 'textSecondary'}
                    >
                      {sub}
                    </Text>
                  ) : null}
                </View>
                <Text variant="headline" tabular testID={`plan-${o.plan}-price`}>
                  {o.price}
                </Text>
              </View>
            </Card>
          );
        })}
      </View>
      {loading ? (
        <Text variant="caption" color="textSecondary" testID="paywall-loading">
          {`Loading prices from ${storeName(b.platform)}…`}
        </Text>
      ) : null}
    </Screen>
  );
}
