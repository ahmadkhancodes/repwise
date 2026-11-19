import { router, useFocusEffect } from 'expo-router';
import { Bell, Dumbbell, Utensils, type LucideIcon } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { track } from '@/services/analytics';
import { haptics } from '@/services/haptics';
import { useTheme } from '@/theme';
import { Button, Screen, Text } from '@/ui';

import { trackStep } from '../actions';
import {
  getNotificationPermission,
  requestNotificationPermission,
} from '../notificationPermission';
import { useOnboarding } from '../store';

type Preview = { icon: LucideIcon; title: string; body: string; when: string };

/** Example reminders (sheet 17 N-1, N-2, N-3 copy), shown as notification banners. */
export const PREVIEWS: Preview[] = [
  {
    icon: Bell,
    title: 'Push day · 52 min',
    body: 'Lunch: chicken karahi bowl · 610 kcal',
    when: '7:15',
  },
  {
    icon: Utensils,
    title: 'Lunch time',
    body: 'Chicken karahi bowl · 610 kcal · 45 g protein',
    when: '13:00',
  },
  { icon: Dumbbell, title: 'Leg day in 30 min', body: '6 exercises · 55 min', when: '17:30' },
];

function Banner({ p, index }: { p: Preview; index: number }) {
  const t = useTheme();
  const Icon = p.icon;
  return (
    <Animated.View
      entering={FadeInDown.delay(150 + index * 160)
        .springify()
        .damping(t.motion.spring.damping)
        .stiffness(t.motion.spring.stiffness)}
      style={{
        flexDirection: 'row',
        gap: t.spacing.sm,
        alignItems: 'center',
        backgroundColor: t.colors.surface,
        borderRadius: t.radius.card,
        borderWidth: t.sizes.hairline,
        borderColor: t.colors.border,
        padding: t.spacing.sm,
      }}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <View
        style={{
          width: t.sizes.touch - t.spacing.xs,
          height: t.sizes.touch - t.spacing.xs,
          borderRadius: t.radius.button,
          backgroundColor: t.colors.inverse,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon
          size={t.sizes.iconSmall + 4}
          strokeWidth={t.sizes.iconStroke}
          color={t.colors.onInverse}
        />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: t.spacing.xs }}>
          <Text variant="callout" numberOfLines={1} style={{ flex: 1 }}>
            {p.title}
          </Text>
          <Text variant="caption" color="textSecondary" tabular>
            {p.when}
          </Text>
        </View>
        <Text variant="caption" color="textSecondary" numberOfLines={2}>
          {p.body}
        </Text>
      </View>
    </Animated.View>
  );
}

/** S06: explain reminders first; the system prompt shows ONLY after "Turn on reminders". */
export function NotifyScreen() {
  const t = useTheme();
  const [busy, setBusy] = useState(false);

  const toPlan = useCallback(() => {
    useOnboarding.getState().setPhase('plan');
    router.replace('/plan');
  }, []);

  useFocusEffect(
    useCallback(() => {
      useOnboarding.getState().setPhase('notify');
      trackStep('notify', 0);
      // Already decided (granted, or "don't ask again"): nothing to explain.
      let live = true;
      void getNotificationPermission().then((s) => {
        if (live && (s === 'granted' || s === 'denied')) toPlan();
      });
      return () => {
        live = false;
      };
    }, [toPlan]),
  );

  const allow = async () => {
    setBusy(true);
    const result = await requestNotificationPermission();
    track('notification_permission', { granted: result === 'granted' });
    if (result === 'granted') haptics.success();
    setBusy(false);
    toPlan();
  };

  const later = () => {
    track('notification_permission', { granted: false, prompted: false });
    toPlan();
  };

  return (
    <Screen
      testID="screen-notify"
      footer={
        <>
          <Button label="Turn on reminders" onPress={allow} loading={busy} testID="notify-allow" />
          <Button
            label="Not now"
            variant="tertiary"
            onPress={later}
            disabled={busy}
            testID="notify-later"
          />
        </>
      }
    >
      <View style={{ gap: t.spacing.sm, paddingTop: t.spacing.xl }}>
        {PREVIEWS.map((p, i) => (
          <Banner key={p.title} p={p} index={i} />
        ))}
      </View>
      <View style={{ gap: t.spacing.sm, paddingTop: t.spacing.lg }}>
        <Text variant="title1" accessibilityRole="header">
          Never miss a meal or a session
        </Text>
        <Text variant="body" color="textSecondary">
          A morning brief, each meal at your meal times and a nudge before training. Quiet from
          22:00 to 07:00. Change it any time in Settings.
        </Text>
      </View>
    </Screen>
  );
}
