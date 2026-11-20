import { Redirect, router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Button, Card, IconButton, Screen, showToast, Text } from '@/ui';

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
  const otherStore =
    pro.subscribed && e?.source && (e.source === 'apple') !== (b.platform === 'ios');

  const onRestore = async () => {
    showToast(restoreMessage(await b.restore()));
  };

  return (
    <Screen
      title="Subscription"
      testID="screen-subscription"
      headerLeft={
        <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={() => router.back()} />
      }
      footer={
        <>
          {pro.subscribed ? (
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
            {pro.subscribed ? planLabel(e?.plan ?? null) : 'Repwise Free'}
          </Text>
          {pro.subscribed && e ? (
            <Text variant="body" color="textSecondary" testID="subscription-renewal">
              {renewalLine(e)}
            </Text>
          ) : (
            <Text variant="body" color="textSecondary">
              Your workouts and logs are always free. Pro adds adaptive plans, daily meal plans and
              full history.
            </Text>
          )}
          {pro.subscribed && e?.source ? (
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
      {b.pendingVerifications > 0 ? (
        <Text variant="callout" color="textSecondary" testID="subscription-pending">
          {"A purchase is waiting to be confirmed. It finishes automatically when you're online."}
        </Text>
      ) : null}
    </Screen>
  );
}
