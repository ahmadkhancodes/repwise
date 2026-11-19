import { router } from 'expo-router';
import { ChevronLeft, CreditCard, Palette, Shield, UserRound } from 'lucide-react-native';

import { usePro } from '@/features/billing/hooks/usePro';

import { useThemeStore, type ThemePreference } from '@/theme';
import { IconButton, ListRow, Screen, Segmented, Text } from '@/ui';

const THEME_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const satisfies readonly { value: ThemePreference; label: string }[];

/** S38 Settings — theme override works now; other rows are placeholders. */
export function SettingsScreen() {
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);
  const pro = usePro();

  return (
    <Screen
      title="Settings"
      testID="screen-settings"
      headerLeft={
        <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={() => router.back()} />
      }
    >
      <Text variant="headline">Appearance</Text>
      <Segmented
        options={THEME_OPTIONS}
        value={preference}
        onChange={setPreference}
        accessibilityLabel="Theme"
        testID="theme"
      />
      <Text variant="headline">Account</Text>
      <ListRow
        icon={UserRound}
        title="Sign in for backup"
        subtitle="Optional — the app works without an account"
        divider
      />
      {pro.paymentsEnabled ? (
        <ListRow
          icon={CreditCard}
          title="Subscription"
          value={pro.subscribed ? 'Pro' : 'Free'}
          onPress={() => router.push('/settings/subscription')}
          divider
          testID="open-subscription"
        />
      ) : null}
      <ListRow icon={Shield} title="Privacy" divider />
      {__DEV__ ? (
        <ListRow
          icon={Palette}
          title="Design system"
          subtitle="Developer gallery"
          onPress={() => router.push('/dev/ui')}
          testID="open-dev-ui"
        />
      ) : null}
    </Screen>
  );
}
