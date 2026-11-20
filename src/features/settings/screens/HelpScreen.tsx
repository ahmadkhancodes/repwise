import { router } from 'expo-router';
import {
  ChevronLeft,
  ExternalLink,
  FileText,
  Lock,
  Mail,
  Trash2,
  UserX,
} from 'lucide-react-native';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { useAuth } from '@/services/auth';
import { useTheme } from '@/theme';
import { IconButton, ListRow, Screen, Text } from '@/ui';

import { DeleteDataSheet } from '../components/DeleteDataSheet';
import { SettingsGroup } from '../components/SettingsGroup';
import { helpLinks, SUPPORT_EMAIL, supportMailto } from '../config';
import { appVersion } from '../data';
import { openLink } from '../links';

/** S42 Help, legal, delete account: contact, terms, privacy, account and data deletion. */
export function HelpScreen() {
  const t = useTheme();
  const links = helpLinks();
  const signedIn = useAuth((s) => s.status === 'signedIn');
  const [deleting, setDeleting] = useState(false);

  return (
    <Screen
      title="Help & legal"
      testID="screen-help"
      headerLeft={
        <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={() => router.back()} />
      }
    >
      <SettingsGroup title="Get help" footnote={`We usually reply within two working days.`}>
        <ListRow
          icon={Mail}
          title="Email support"
          subtitle={SUPPORT_EMAIL}
          onPress={() => void openLink(supportMailto(appVersion(), Platform.OS))}
          testID="help-email"
        />
        <ListRow
          icon={ExternalLink}
          title="Help centre"
          subtitle="Plans, workouts, meals and billing"
          onPress={() => void openLink(links.help)}
          testID="help-centre"
        />
      </SettingsGroup>

      <SettingsGroup title="Legal">
        <ListRow
          icon={FileText}
          title="Terms of use"
          onPress={() => void openLink(links.terms)}
          testID="help-terms"
        />
        <ListRow
          icon={Lock}
          title="Privacy policy"
          onPress={() => void openLink(links.privacy)}
          testID="help-privacy"
        />
      </SettingsGroup>

      <SettingsGroup
        title="Delete"
        footnote={
          signedIn
            ? 'Deleting your account removes your backup from our servers. Data on this phone stays unless you delete it too.'
            : "You don't have a backup account, so everything is on this phone only."
        }
      >
        {signedIn ? (
          <ListRow
            icon={UserX}
            title="Delete account"
            subtitle="Removes your backup"
            onPress={() => router.push('/settings/account')}
            testID="help-delete-account"
          />
        ) : null}
        <ListRow
          icon={Trash2}
          title="Delete all data"
          destructive
          chevron={false}
          onPress={() => setDeleting(true)}
          testID="help-delete-data"
        />
      </SettingsGroup>

      <View style={{ gap: t.spacing.xs, paddingVertical: t.spacing.md }}>
        <Text variant="callout" color="textSecondary">
          Repwise gives general fitness and nutrition guidance. It is not medical advice. Talk to a
          qualified professional before starting a new exercise or diet programme.
        </Text>
        <Text variant="caption" color="textSecondary" tabular>
          {`Repwise ${appVersion()}`}
        </Text>
      </View>

      <DeleteDataSheet open={deleting} onClose={() => setDeleting(false)} />
    </Screen>
  );
}
