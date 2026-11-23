import { router } from 'expo-router';
import { Check, Sparkles } from 'lucide-react-native';
import { useEffect } from 'react';
import { View } from 'react-native';
import { create } from 'zustand';

import { billing } from '@/services/billing';
import { useTheme } from '@/theme';
// Direct imports, not the '@/ui' barrel: this host is mounted by the root layout.
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';

import { useBilling } from '../hooks/useBilling';
import { DEFAULT_PLAN } from '../plans';
import { GATES, gateCta, gateSource, type GateFeature } from '../logic/gates';

/** The one open gate (or none). Opened by {@link openGate}, drawn by {@link GateSheetHost}. */
export const useGateSheet = create<{ feature: GateFeature | null }>(() => ({ feature: null }));

/** Free user hit a Pro feature: show the contextual sheet (F-S5). */
export function openGate(feature: GateFeature): void {
  useGateSheet.setState({ feature });
}

export function closeGate(): void {
  useGateSheet.setState({ feature: null });
}

/**
 * F-S5 "Hit a Pro limit": a bottom sheet naming the exact benefit in context with a preview, then
 * "Start free trial" (→ the full paywall) or "Not now" (back to where they were). Mounted once
 * in the root layout.
 */
export function GateSheetHost() {
  const t = useTheme();
  const feature = useGateSheet((s) => s.feature);
  const b = useBilling();

  useEffect(() => {
    if (feature) billing().trackPaywallView(gateSource(feature));
  }, [feature]);

  const copy = feature ? GATES[feature] : null;
  const trialDays = b.offers.find((o) => o.plan === DEFAULT_PLAN)?.trialDays ?? 0;

  const onTrial = () => {
    if (!feature) return;
    closeGate();
    router.push({ pathname: '/paywall', params: { source: gateSource(feature), via: 'sheet' } });
  };

  return (
    <Sheet open={copy !== null} onClose={closeGate} testID="gate-sheet">
      {copy ? (
        <View style={{ gap: t.spacing.md }}>
          <View style={{ gap: t.spacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}>
              <Sparkles
                color={t.colors.accentText}
                size={t.sizes.iconSmall}
                strokeWidth={t.sizes.iconStrokeBold}
              />
              <Text variant="eyebrow" color="accentText">
                Repwise Pro
              </Text>
            </View>
            <Text variant="title2" accessibilityRole="header" testID="gate-title">
              {copy.title}
            </Text>
            <Text variant="body" color="textSecondary">
              {copy.body}
            </Text>
          </View>
          <View
            testID="gate-preview"
            style={{
              gap: t.spacing.xs,
              backgroundColor: t.colors.surface,
              borderRadius: t.radius.card,
              padding: t.spacing.card,
            }}
          >
            {copy.preview.map((line) => (
              <View
                key={line}
                style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}
              >
                <Check
                  color={t.colors.accentText}
                  size={t.sizes.iconSmall}
                  strokeWidth={t.sizes.iconStrokeBold}
                />
                <Text variant="body" style={{ flex: 1 }}>
                  {line}
                </Text>
              </View>
            ))}
          </View>
          <View style={{ gap: t.spacing.xs }}>
            <Button label={gateCta(trialDays)} accent onPress={onTrial} testID="gate-cta" />
            <Button label="Not now" variant="tertiary" onPress={closeGate} testID="gate-not-now" />
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}
