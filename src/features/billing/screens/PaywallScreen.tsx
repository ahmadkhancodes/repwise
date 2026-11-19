import { router } from 'expo-router';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Button, Card, IconButton, Screen, showToast, Text } from '@/ui';

import { ctaLabel, DEFAULT_PLAN, PLANS, priceLine, type PlanId } from '../plans';

/** S37 Paywall (modal) — layout placeholder; store billing is wired in a later task. */
export function PaywallScreen() {
  const t = useTheme();
  const [selected, setSelected] = useState<PlanId>(DEFAULT_PLAN);
  const plan = PLANS.find((p) => p.id === selected) ?? PLANS[PLANS.length - 1]!;
  const notYet = () => showToast({ message: 'Purchases are not connected in this build yet.' });

  return (
    <Screen
      title="Repwise Pro"
      testID="screen-paywall"
      headerLeft={
        <IconButton
          icon={X}
          accessibilityLabel="Close"
          onPress={() => router.back()}
          testID="paywall-close"
        />
      }
      footer={
        <>
          <Button label={ctaLabel(plan)} accent onPress={notYet} testID="paywall-cta" />
          <Text variant="caption" color="textSecondary" align="center">
            {priceLine(plan)}
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
            <Button label="Restore" variant="tertiary" onPress={notYet} />
            <Button label="Terms" variant="tertiary" onPress={notYet} />
            <Button label="Privacy" variant="tertiary" onPress={notYet} />
          </View>
        </>
      }
    >
      <Text variant="body" color="textSecondary">
        Your training and your meals, planned every day. No ads, ever.
      </Text>
      <View style={{ gap: t.spacing.xs }}>
        {PLANS.map((p) => (
          <Card
            key={p.id}
            selected={p.id === selected}
            onPress={() => setSelected(p.id)}
            accessibilityLabel={`${p.title}, ${p.price} per ${p.period}${p.trialDays ? `, ${p.trialDays}-day free trial` : ''}`}
            testID={`plan-${p.id}`}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Text variant="headline">{p.title}</Text>
                {p.trialDays ? (
                  <Text variant="caption" color="accentText">
                    {`${p.trialDays}-day free trial`}
                  </Text>
                ) : null}
              </View>
              <Text variant="headline" tabular>
                {p.price}
              </Text>
            </View>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
