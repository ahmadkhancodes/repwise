import { Check, CreditCard, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DEMO_PAYMENTS_AVAILABLE } from '@/services/demoPayments';
import { haptics } from '@/services/haptics';
import { useTheme } from '@/theme';
import { Badge, Button, IconButton, sheetMaxHeight, Text, TextField } from '@/ui';

import type { PlanOffer } from '../logic/offers';
import { planById } from '../plans';

/** Processing spinner time before "Payment complete" (owner spec ~1.2 s). */
export const DEMO_PROCESSING_MS = 1200;

export const DEMO_CARD = { number: '4444 4444 4444 4444', expiry: '12/34', cvc: '123' } as const;

/** "$0.00" during a free trial, else the plan price. Pure. */
export function totalToday(offer: Pick<PlanOffer, 'trialDays' | 'price' | 'currency'>): string {
  if (offer.trialDays <= 0) return offer.price;
  return offer.currency && offer.currency !== 'USD' ? `0.00 ${offer.currency}` : '$0.00';
}

/** "•••• 4444" from whatever was typed. Pure. */
export function maskedCard(number: string): string {
  const digits = number.replace(/\D/g, '');
  return `•••• ${digits.slice(-4).padStart(4, '•')}`;
}

/** Plan summary line under the plan name. Pure. */
export function planSummary(offer: Pick<PlanOffer, 'plan' | 'trialDays' | 'price'>): string {
  const p = planById(offer.plan);
  return offer.trialDays > 0
    ? `${offer.trialDays}-day free trial, then ${offer.price}/${p.period}`
    : `${offer.price} every ${p.period}`;
}

export type DemoCheckoutProps = {
  offer: PlanOffer;
  /** Back to the paywall (no purchase). */
  onCancel: () => void;
  /** "Continue" on "Payment complete": unlock and leave the paywall. */
  onComplete: () => void;
};

type Step = 'review' | 'processing' | 'done';

/**
 * DEMO checkout (D-DEMO-PAY): a native-looking payment sheet marked TEST MODE, drawn inside the
 * paywall (a native modal, so the root sheet host would sit behind it). No network, no store,
 * no Stripe. Renders nothing in production builds.
 */
export function DemoCheckout(props: DemoCheckoutProps) {
  if (!DEMO_PAYMENTS_AVAILABLE) return null;
  return <DemoCheckoutSheet {...props} />;
}

function DemoCheckoutSheet({ offer, onCancel, onComplete }: DemoCheckoutProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState<Step>('review');
  const [card, setCard] = useState<string>(DEMO_CARD.number);
  const [expiry, setExpiry] = useState<string>(DEMO_CARD.expiry);
  const [cvc, setCvc] = useState<string>(DEMO_CARD.cvc);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const plan = planById(offer.plan);

  const rise = useSharedValue(reduceMotion ? 0 : 1);
  const tick = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    rise.value = withSpring(0, t.motion.spring);
  }, [rise, t.motion.spring]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: rise.value * height }],
  }));
  const tickStyle = useAnimatedStyle(() => ({
    opacity: tick.value,
    transform: [{ scale: 0.6 + 0.4 * tick.value }],
  }));

  const onConfirm = () => {
    setStep('processing');
    AccessibilityInfo.announceForAccessibility('Processing payment');
    timer.current = setTimeout(() => {
      setStep('done');
      haptics.success();
      AccessibilityInfo.announceForAccessibility('Payment complete');
      tick.value = reduceMotion ? 1 : withSpring(1, t.motion.spring);
    }, DEMO_PROCESSING_MS);
  };

  const cardValid = card.replace(/\D/g, '').length >= 12 && expiry.length >= 4 && cvc.length >= 3;

  return (
    <View style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end' }]} testID="demo-checkout">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: t.colors.scrim }]} />
      <Animated.View
        accessibilityViewIsModal
        style={[
          sheetStyle,
          {
            backgroundColor: t.colors.bg,
            borderTopLeftRadius: t.radius.sheet,
            borderTopRightRadius: t.radius.sheet,
            paddingHorizontal: t.spacing.screen,
            paddingTop: t.spacing.md,
            paddingBottom: insets.bottom + t.spacing.md,
            maxHeight: sheetMaxHeight(height, insets.top),
          },
        ]}
      >
        {step === 'done' ? (
          <View
            style={{ alignItems: 'center', gap: t.spacing.md, paddingVertical: t.spacing.xl }}
            testID="demo-payment-complete"
          >
            <Animated.View
              style={[
                tickStyle,
                {
                  width: t.spacing.xxxl * 2,
                  height: t.spacing.xxxl * 2,
                  borderRadius: t.radius.pill,
                  backgroundColor: t.colors.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                },
              ]}
            >
              <Check
                color={t.colors.onAccent}
                size={t.sizes.icon * 1.5}
                strokeWidth={t.sizes.iconStrokeBold}
              />
            </Animated.View>
            <Badge label="TEST MODE" tone="outline" />
            <Text variant="title1" align="center" accessibilityRole="header">
              Payment complete
            </Text>
            <Text variant="body" color="textSecondary" align="center" tabular>
              {`Repwise Pro · ${plan.title} is unlocked.${offer.trialDays > 0 ? ` Your ${offer.trialDays}-day free trial has started.` : ''}`}
            </Text>
            <View style={{ alignSelf: 'stretch', paddingTop: t.spacing.sm }}>
              <Button label="Continue" accent onPress={onComplete} testID="demo-continue" />
            </View>
          </View>
        ) : (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: t.spacing.md }}
            showsVerticalScrollIndicator={false}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}>
              <Text variant="title2" accessibilityRole="header" style={{ flex: 1 }}>
                Checkout
              </Text>
              <View testID="demo-test-badge">
                <Badge label="TEST MODE" tone="danger" />
              </View>
              <IconButton
                icon={X}
                accessibilityLabel="Cancel checkout"
                onPress={onCancel}
                disabled={step === 'processing'}
                testID="demo-cancel"
              />
            </View>

            <View
              style={{
                backgroundColor: t.colors.surface,
                borderRadius: t.radius.card,
                padding: t.spacing.card,
                gap: t.spacing.xxs,
              }}
              testID="demo-plan-summary"
            >
              <Text variant="headline">{`Repwise Pro · ${plan.title}`}</Text>
              <Text variant="callout" color="textSecondary" tabular>
                {planSummary(offer)}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
              <CreditCard
                color={t.colors.textPrimary}
                size={t.sizes.iconMedium}
                strokeWidth={t.sizes.iconStroke}
              />
              <Text variant="headline" tabular testID="demo-card-masked" style={{ flex: 1 }}>
                {`Card ${maskedCard(card)}`}
              </Text>
              <Text variant="caption" color="textSecondary">
                Test card
              </Text>
            </View>
            <TextField
              label="Card number"
              value={card}
              onChangeText={setCard}
              keyboardType="number-pad"
              editable={step === 'review'}
              testID="demo-card-number"
            />
            <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Expiry"
                  value={expiry}
                  onChangeText={setExpiry}
                  keyboardType="number-pad"
                  editable={step === 'review'}
                  testID="demo-card-expiry"
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextField
                  label="CVC"
                  value={cvc}
                  onChangeText={setCvc}
                  keyboardType="number-pad"
                  editable={step === 'review'}
                  testID="demo-card-cvc"
                />
              </View>
            </View>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderTopWidth: t.sizes.hairline,
                borderTopColor: t.colors.border,
                paddingTop: t.spacing.sm,
              }}
            >
              <Text variant="headline" style={{ flex: 1 }}>
                Total today
              </Text>
              <Text variant="title2" tabular testID="demo-total">
                {totalToday(offer)}
              </Text>
            </View>

            {step === 'processing' ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: t.spacing.sm,
                  minHeight: t.sizes.hitGymLarge,
                }}
                testID="demo-processing"
              >
                <ActivityIndicator color={t.colors.accent} />
                <Text variant="headline">Processing…</Text>
              </View>
            ) : (
              <Button
                label="Confirm"
                accent
                onPress={onConfirm}
                disabled={!cardValid}
                testID="demo-confirm"
              />
            )}
            <Text variant="caption" color="textSecondary" align="center">
              Test mode. No real payment is taken and nothing leaves your phone.
            </Text>
          </ScrollView>
        )}
      </Animated.View>
    </View>
  );
}
