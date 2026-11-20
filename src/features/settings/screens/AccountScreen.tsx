import * as AppleAuthentication from 'expo-apple-authentication';

import { CloudUpload, Mail } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { haptics } from '@/services/haptics';
import {
  deleteAccount,
  isAppleSignInAvailable,
  isAppleSignInSupported,
  isGoogleSignInConfigured,
  signInWithApple,
  signInWithGoogle,
  signOut,
  startEmailSignIn,
  useAuth,
  verifyEmailCode,
  type SignInResult,
} from '@/services/auth';
import { useConnectivity } from '@/services/connectivity';
import { syncNow, useSyncStatus } from '@/sync';
import { useTheme } from '@/theme';
import { BackButton, Button, Card, Screen, Sheet, showToast, Text, TextField } from '@/ui';

import { GoogleButton } from '../components/GoogleButton';
import { backupLabel, errorMessage, providerLabel } from '../logic/account';

type Busy = null | 'apple' | 'google' | 'email' | 'code' | 'sync' | 'signout' | 'delete';

/** S39/S40 Backup & account: optional sign-in for backup/restore, sign out, delete account. */
export function AccountScreen() {
  const status = useAuth((s) => s.status);
  return (
    <Screen title="Backup & account" keyboard testID="screen-account" headerLeft={<BackButton />}>
      {status === 'signedIn' ? <SignedIn /> : <SignIn loading={status === 'loading'} />}
    </Screen>
  );
}

function SignIn({ loading }: { loading: boolean }) {
  const t = useTheme();
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'choose' | 'email' | 'code'>('choose');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    let alive = true;
    if (isAppleSignInSupported()) {
      isAppleSignInAvailable().then((ok) => {
        if (alive) setAppleAvailable(ok);
      });
    }
    return () => {
      alive = false;
    };
  }, []);

  async function run(kind: Busy, fn: () => Promise<SignInResult | void>) {
    setBusy(kind);
    setError(null);
    try {
      const r = await fn();
      if (r && r.ok) {
        haptics.light();
        showToast({ message: 'Signed in. Backing up your data.', tone: 'success', silent: true });
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const disabled = loading || busy !== null;

  return (
    <View style={{ gap: t.spacing.md }}>
      <Text variant="body" color="textSecondary">
        Sign in to back up your workouts, meals and progress, and restore them on a new phone.
        Optional: Repwise works fully without an account.
      </Text>

      {step === 'choose' ? (
        <View style={{ gap: t.spacing.sm }}>
          {appleAvailable ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={
                t.scheme === 'dark'
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={t.radius.button}
              style={{ height: t.sizes.button, width: '100%' }}
              onPress={() => {
                if (!disabled) void run('apple', signInWithApple);
              }}
            />
          ) : null}
          {isGoogleSignInConfigured() ? (
            <GoogleButton
              loading={busy === 'google'}
              disabled={disabled}
              onPress={() => void run('google', signInWithGoogle)}
              testID="google-sign-in"
            />
          ) : null}
          <Button
            label="Continue with email"
            variant="secondary"
            icon={Mail}
            disabled={disabled}
            onPress={() => {
              setError(null);
              setStep('email');
            }}
            testID="email-sign-in"
          />
        </View>
      ) : null}

      {step === 'email' ? (
        <View style={{ gap: t.spacing.sm }}>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="send"
            placeholder="you@example.com"
            testID="email-input"
          />
          <Button
            label="Send code"
            loading={busy === 'email'}
            disabled={disabled || email.trim().length === 0}
            onPress={() =>
              void run('email', async () => {
                await startEmailSignIn(email);
                setStep('code');
              })
            }
            testID="send-code"
          />
          <Button
            label="Back"
            variant="tertiary"
            disabled={disabled}
            onPress={() => setStep('choose')}
          />
        </View>
      ) : null}

      {step === 'code' ? (
        <View style={{ gap: t.spacing.sm }}>
          <Text variant="body" color="textSecondary">
            We sent a 6-digit code to {email.trim()}. It expires in 10 minutes.
          </Text>
          <TextField
            label="Code"
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            testID="code-input"
          />
          <Button
            label="Verify"
            loading={busy === 'code'}
            disabled={disabled || code.length !== 6}
            onPress={() => void run('code', () => verifyEmailCode(email, code))}
            testID="verify-code"
          />
          <Button
            label="Use a different email"
            variant="tertiary"
            disabled={disabled}
            onPress={() => {
              setCode('');
              setStep('email');
            }}
          />
        </View>
      ) : null}

      {error ? (
        <Text variant="callout" color="danger" accessibilityRole="alert" testID="account-error">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** Wall clock for relative labels, ticking every `everyMs` and whenever `dep` changes. */
function useNow(everyMs: number, dep: unknown): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, everyMs);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(id);
      clearTimeout(first);
    };
  }, [everyMs, dep]);
  return now;
}

function SignedIn() {
  const t = useTheme();
  const user = useAuth((s) => s.user);
  const provider = useAuth((s) => s.provider);
  const lastSyncAt = useSyncStatus((s) => s.lastSyncAt);
  const syncing = useSyncStatus((s) => s.running);
  const syncOffline = useSyncStatus((s) => s.offline);
  const online = useConnectivity((s) => s.online);
  const [busy, setBusy] = useState<Busy>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offline = online === false || syncOffline;
  const now = useNow(30_000, lastSyncAt);

  async function backUpNow() {
    setBusy('sync');
    const r = await syncNow({ pull: true });
    setBusy(null);
    if (r.status === 'ok')
      showToast({ message: 'Backup up to date.', tone: 'success', silent: true });
    else if (r.status === 'error') {
      showToast({
        message: r.offline
          ? "You're offline. We'll back up when you're connected."
          : 'Backup failed. Try again.',
        tone: 'danger',
      });
    }
  }

  async function doSignOut() {
    setBusy('signout');
    await signOut();
    setBusy(null);
    showToast({ message: 'Signed out. Your data stays on this phone.' });
  }

  async function doDelete() {
    setBusy('delete');
    setError(null);
    try {
      await deleteAccount();
      setConfirmDelete(false);
      showToast({ message: 'Account deleted. Data on this phone stays.' });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{ gap: t.spacing.md }}>
      <Card>
        <View style={{ gap: t.spacing.xxs }}>
          <Text variant="headline">{providerLabel(provider)}</Text>
          {user?.email ? (
            <Text variant="body" color="textSecondary" testID="account-email">
              {user.email}
            </Text>
          ) : null}
        </View>
      </Card>

      <View style={{ gap: t.spacing.xs }}>
        <Text variant="headline">Backup</Text>
        <Text variant="body" color="textSecondary" testID="backup-status">
          {offline
            ? "Offline. Changes are saved on this phone and back up when you're connected."
            : backupLabel(lastSyncAt, now)}
        </Text>
        <Button
          label="Back up now"
          variant="secondary"
          icon={CloudUpload}
          loading={busy === 'sync' || syncing}
          disabled={busy !== null}
          onPress={() => void backUpNow()}
          testID="backup-now"
        />
      </View>

      <Button
        label="Sign out"
        variant="secondary"
        loading={busy === 'signout'}
        disabled={busy !== null}
        onPress={() => void doSignOut()}
        testID="sign-out"
      />
      <Button
        label="Delete account"
        variant="tertiary"
        accessibilityHint="Opens a confirmation"
        disabled={busy !== null}
        onPress={() => {
          setError(null);
          setConfirmDelete(true);
        }}
        testID="delete-account"
      />

      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete account?"
        testID="delete-sheet"
      >
        <Text variant="body" color="textSecondary">
          This permanently deletes your Repwise account and everything backed up on our servers,
          including AI plan history. Data on this phone stays.
        </Text>
        <Text variant="body" color="textSecondary">
          Subscriptions are billed by the App Store or Google Play. Deleting your account does not
          cancel them; cancel in your store settings first.
        </Text>
        {error ? (
          <Text variant="callout" color="danger" accessibilityRole="alert" testID="delete-error">
            {error}
          </Text>
        ) : null}
        <Button
          label="Delete account"
          variant="destructive"
          loading={busy === 'delete'}
          disabled={busy !== null && busy !== 'delete'}
          onPress={() => void doDelete()}
          testID="confirm-delete"
        />
        <Button
          label="Cancel"
          variant="secondary"
          disabled={busy === 'delete'}
          onPress={() => setConfirmDelete(false)}
        />
      </Sheet>
    </View>
  );
}
