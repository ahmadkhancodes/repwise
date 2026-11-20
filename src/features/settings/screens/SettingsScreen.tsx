import { router, type Href } from 'expo-router';
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  CreditCard,
  Download,
  FileText,
  LifeBuoy,
  Lock,
  Palette,
  RotateCcw,
  Shield,
  SunMedium,
  Trash2,
  Vibrate,
  Volume2,
} from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useBilling } from '@/features/billing/hooks/useBilling';
import { usePro } from '@/features/billing/hooks/usePro';
import { restoreMessage } from '@/features/billing/screens/PaywallScreen';
import { ToggleRow } from '@/features/notifications/components/ToggleRow';
import { useAuth } from '@/services/auth';
import { useShareUsageData } from '@/services/privacy';
import { useTheme, useThemeStore, type ThemePreference } from '@/theme';
import { IconButton, ListRow, PressableScale, Screen, Segmented, showToast, Text } from '@/ui';

import { DeleteDataSheet } from '../components/DeleteDataSheet';
import { SettingsGroup } from '../components/SettingsGroup';
import { helpLinks } from '../config';
import { appVersion, exportAllData } from '../data';
import { openLink } from '../links';
import { profileSummary } from '../logic/profile';
import { useAppPrefs } from '../prefs';
import { saveProfile, useProfile } from '../repo';

const THEME_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const satisfies readonly { value: ThemePreference; label: string }[];

const UNIT_OPTIONS = [
  { value: 'metric', label: 'kg · cm' },
  { value: 'imperial', label: 'lb · ft' },
] as const;

/** A labelled Segmented control laid out as a settings row. */
function SegmentRow({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.xs, paddingVertical: t.spacing.sm }}>
      <Text variant="body">{title}</Text>
      {children}
    </View>
  );
}

/** Profile & plan summary: the one "hero" on Settings, opens the plan editor. */
function ProfileCard() {
  const t = useTheme();
  const profile = useProfile();
  const s = profileSummary(profile);
  const initial = s.title.slice(0, 1).toUpperCase();
  return (
    <Animated.View
      entering={FadeInDown.springify()
        .damping(t.motion.spring.damping)
        .stiffness(t.motion.spring.stiffness)}
    >
      <PressableScale
        testID="open-profile"
        onPress={() => router.push((profile?.goal ? '/settings/profile' : '/welcome') as Href)}
        accessibilityRole="button"
        accessibilityLabel={`Profile and plan: ${s.title}, ${s.line}`}
        accessibilityHint="Edit your goal, training days and equipment"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.md,
          padding: t.spacing.card,
          borderRadius: t.radius.card,
          backgroundColor: t.colors.inverse,
          minHeight: t.sizes.hitGymLarge + t.spacing.lg,
        }}
      >
        <View
          style={{
            width: t.sizes.hitGym,
            height: t.sizes.hitGym,
            borderRadius: t.radius.pill,
            backgroundColor: t.colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="title2" color="onAccent">
            {initial}
          </Text>
        </View>
        <View style={{ flex: 1, gap: t.spacing.xxs }}>
          <Text variant="caption" color="onInverse" style={{ opacity: 0.8 }}>
            PROFILE & PLAN
          </Text>
          <Text variant="title2" color="onInverse" numberOfLines={1} testID="profile-goal">
            {s.title}
          </Text>
          <Text variant="callout" color="onInverse" tabular numberOfLines={2} testID="profile-line">
            {s.line}
          </Text>
        </View>
        <ChevronRight
          color={t.colors.onInverse}
          size={t.sizes.icon}
          strokeWidth={t.sizes.iconStroke}
        />
      </PressableScale>
    </Animated.View>
  );
}

/** S38 Settings: profile & plan, units, appearance, workout, reminders, account, privacy, data. */
export function SettingsScreen() {
  const t = useTheme();
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);
  const profile = useProfile();
  const pro = usePro();
  const billing = useBilling();
  const signedIn = useAuth((s) => s.status === 'signedIn');
  const email = useAuth((s) => s.user?.email ?? null);
  const [shareUsage, setShareUsage] = useShareUsageData();
  const keepAwake = useAppPrefs((s) => s.keepAwake);
  const restSound = useAppPrefs((s) => s.restSound);
  const restVibration = useAppPrefs((s) => s.restVibration);
  const setPref = useAppPrefs((s) => s.setPref);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const links = helpLinks();
  const units = profile?.units === 'imperial' ? 'imperial' : 'metric';

  const onExport = async () => {
    if (exporting) return;
    setExporting(true);
    const r = await exportAllData();
    setExporting(false);
    if (r.status === 'unavailable') {
      showToast({ message: "Sharing isn't available on this phone.", tone: 'danger' });
    } else if (r.status === 'error') {
      showToast({ message: "Couldn't export your data. Try again.", tone: 'danger' });
    }
  };

  const onRestore = async () => {
    showToast({ ...restoreMessage(await billing.restore()), silent: true });
  };

  return (
    <Screen
      title="Settings"
      testID="screen-settings"
      headerLeft={
        <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={() => router.back()} />
      }
    >
      <ProfileCard />

      <SettingsGroup title="Preferences" testID="group-preferences">
        <SegmentRow title="Units">
          <Segmented
            options={UNIT_OPTIONS}
            value={units}
            onChange={(v) => {
              if (profile) saveProfile({ units: v });
            }}
            accessibilityLabel="Units"
            testID="units"
          />
        </SegmentRow>
        <SegmentRow title="Appearance">
          <Segmented
            options={THEME_OPTIONS}
            value={preference}
            onChange={setPreference}
            accessibilityLabel="Theme"
            testID="theme"
          />
        </SegmentRow>
      </SettingsGroup>

      <SettingsGroup
        title="Workout"
        footnote="The rest-over alert also plays when the phone is locked."
        testID="group-workout"
      >
        <ToggleRow
          icon={SunMedium}
          title="Keep screen on"
          subtitle="While a workout is running"
          value={keepAwake}
          onChange={(v) => setPref('keepAwake', v)}
          testID="toggle-keep-awake"
        />
        <ToggleRow
          icon={Volume2}
          title="Rest timer sound"
          value={restSound}
          onChange={(v) => setPref('restSound', v)}
          testID="toggle-rest-sound"
        />
        <ToggleRow
          icon={Vibrate}
          title="Rest timer vibration"
          value={restVibration}
          onChange={(v) => setPref('restVibration', v)}
          testID="toggle-rest-vibration"
        />
      </SettingsGroup>

      <SettingsGroup title="Reminders">
        <ListRow
          icon={Bell}
          title="Notifications"
          subtitle="Morning brief, meals, workouts, quiet hours"
          onPress={() => router.push('/settings/notifications')}
          testID="open-notifications"
        />
      </SettingsGroup>

      <SettingsGroup title="Account" testID="group-account">
        <ListRow
          icon={CloudUpload}
          title="Backup & account"
          subtitle={
            signedIn ? (email ?? 'Signed in, backup on') : 'Optional: Repwise works without one'
          }
          onPress={() => router.push('/settings/account')}
          testID="open-account"
        />
        {pro.paymentsEnabled ? (
          <ListRow
            icon={CreditCard}
            title="Subscription"
            value={pro.subscribed ? 'Pro' : 'Free'}
            onPress={() => router.push('/settings/subscription')}
            testID="open-subscription"
          />
        ) : null}
        {pro.paymentsEnabled ? (
          <ListRow
            icon={RotateCcw}
            title={billing.restoring ? 'Restoring…' : 'Restore purchases'}
            onPress={() => void onRestore()}
            chevron={false}
            disabled={billing.restoring}
            testID="restore-purchases"
          />
        ) : null}
      </SettingsGroup>

      <SettingsGroup
        title="Privacy"
        footnote="Anonymous app usage and crash reports help us fix bugs. Never your body stats, meals or photos."
        testID="group-privacy"
      >
        <ToggleRow
          icon={Shield}
          title="Share anonymous usage data"
          value={shareUsage}
          onChange={setShareUsage}
          testID="toggle-share-usage"
        />
        <ListRow
          icon={Lock}
          title="Privacy policy"
          onPress={() => void openLink(links.privacy)}
          testID="open-privacy"
        />
      </SettingsGroup>

      <SettingsGroup title="Your data" testID="group-data">
        <ListRow
          icon={Download}
          title={exporting ? 'Preparing export…' : 'Export my data'}
          subtitle="Everything you logged, as a JSON file"
          onPress={() => void onExport()}
          chevron={false}
          disabled={exporting}
          testID="export-data"
        />
        <ListRow
          icon={Trash2}
          title="Delete all data"
          subtitle="Plan, logs and photos on this phone"
          destructive
          chevron={false}
          onPress={() => setDeleting(true)}
          testID="delete-data"
        />
      </SettingsGroup>

      <SettingsGroup title="Help">
        <ListRow
          icon={LifeBuoy}
          title="Help & support"
          onPress={() => router.push('/settings/help' as Href)}
          testID="open-help"
        />
        <ListRow
          icon={FileText}
          title="Terms of use"
          onPress={() => void openLink(links.terms)}
          testID="open-terms"
        />
        {__DEV__ ? (
          <ListRow
            icon={Palette}
            title="Design system"
            subtitle="Developer gallery"
            onPress={() => router.push('/dev/ui')}
            testID="open-dev-ui"
          />
        ) : null}
      </SettingsGroup>

      <View style={{ alignItems: 'center', gap: t.spacing.xxs, paddingVertical: t.spacing.lg }}>
        <Text variant="callout" color="textSecondary" tabular testID="app-version">
          {`Repwise ${appVersion()}`}
        </Text>
        <Text variant="caption" color="textSecondary">
          No ads. Your data stays on this phone unless you back up.
        </Text>
      </View>

      <DeleteDataSheet open={deleting} onClose={() => setDeleting(false)} />
    </Screen>
  );
}
