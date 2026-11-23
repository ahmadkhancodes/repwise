import { Redirect, router } from 'expo-router';

import { View } from 'react-native';

import { DEMO_PAYMENTS_AVAILABLE, resetDemoEntitlement } from '@/services/demoPayments';
import { useTheme } from '@/theme';
import { BackButton, Button, Card, Screen, showToast, Text } from '@/ui';

import { useBilling } from '../hooks/useBilling';
import { usePro } from '../hooks/usePro';
import { planLabel, renewalLine, storeName } from '../logic/manage';
import { restoreMessage } from './PaywallScreen';

/** S41 Settings → Subscription: plan, renewal/expiry, Manage (store deep link), Restore. */
export function SubscriptionScreen() {
  const t = useTheme();
  const pro = usePro();
  const b = useBilling();

  // Hidden while payments are off.
  if (!pro.paymentsEnabled) return <Redirect href="/settings" />;

  const e = pro.entitlement;
  const demo = pro.demo;
  const otherStore =
    pro.subscribed && e?.source && (e.source === 'apple') !== (b.platform === 'ios');

  const onRestore = async () => {
    showToast(restoreMessage(await b.restore()));
  };

  return (
    <Screen
      title="Subscription"
      testID="screen-subscription"
      headerLeft={<BackButton />}
      footer={
        <>
          {demo ? null : pro.subscribed ? (
            <Button
              label="Manage or cancel"
              onPress={() => void b.openManage()}
              accessibilityHint={`Opens your subscriptions in ${storeName(e?.source ?? b.platform)}`}
              testID="subscription-manage"
            />
          ) : (
            <Button
              label="See plans"
              onPress={() => router.push('/paywall?source=settings')}
              testID="subscription-see-plans"
            />
          )}
          <Button
            label="Restore purchases"
            variant="tertiary"
            onPress={onRestore}
            loading={b.restoring}
            testID="subscription-restore"
          />
        </>
      }
    >
      <Card testID="subscription-card">
        <View style={{ gap: t.spacing.xxs }}>
          <Text variant="headline" testID="subscription-plan">
            {demo
              ? `${planLabel(demo.plan)} (test)`
              : pro.subscribed
                ? planLabel(e?.plan ?? null)
                : 'Repwise Free'}
          </Text>
          {demo ? (
            <Text variant="body" color="textSecondary" testID="subscription-renewal">
              {demo.trialEndsAt
                ? 'Test purchase with a free trial. No real payment was taken.'
                : 'Test purchase. No real payment was taken.'}
            </Text>
          ) : pro.subscribed && e ? (
            <Text variant="body" color="textSecondary" testID="subscription-renewal">
              {renewalLine(e)}
            </Text>
          ) : (
            <Text variant="body" color="textSecondary">
              Your workouts and logs are always free. Pro adds adaptive plans, daily meal plans and
              full history.
            </Text>
          )}
          {!demo && pro.subscribed && e?.source ? (
            <Text variant="callout" color="textSecondary">
              {`Billed by ${storeName(e.source)}.`}
            </Text>
          ) : null}
        </View>
      </Card>
      {otherStore ? (
        <Text variant="callout" color="textSecondary" testID="subscription-other-store">
          {`You subscribed through ${storeName(e!.source)}. Manage or cancel it there; it stays active on all your devices.`}
        </Text>
      ) : null}
      {DEMO_PAYMENTS_AVAILABLE && demo ? (
        <View style={{ gap: t.spacing.xs }} testID="subscription-debug">
          <Text variant="eyebrow" color="textSecondary">
            Debug · test mode
          </Text>
          <Button
            label="Reset test purchase"
            variant="secondary"
            onPress={() => {
              resetDemoEntitlement();
              showToast({ message: 'Test purchase reset' });
            }}
            testID="subscription-reset-test"
          />
        </View>
      ) : null}
      {b.pendingVerifications > 0 ? (
        <Text variant="callout" color="textSecondary" testID="subscription-pending">
          {"A purchase is waiting to be confirmed. It finishes automatically when you're online."}
        </Text>
      ) : null}
    </Screen>
  );
}
