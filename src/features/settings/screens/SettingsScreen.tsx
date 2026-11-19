import { router } from 'expo-router';
import { ChevronLeft, Palette, Shield, UserRound } from 'lucide-react-native';

import { useAuth } from '@/services/auth';
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
  const signedIn = useAuth((s) => s.status === 'signedIn');
  const email = useAuth((s) => s.user?.email ?? null);
  const accountSubtitle = signedIn
    ? (email ?? 'Signed in, backup on')
    : 'Optional: the app works without an account';

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
        title="Backup & account"
        subtitle={accountSubtitle}
        onPress={() => router.push('/settings/account')}
        divider
        testID="open-account"
      />
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
