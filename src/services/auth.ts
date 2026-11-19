/**
 * Auth (sheet 15): no sign-up wall. A silent anonymous Worker account is created only when a
 * server feature needs one (AI plan, purchase); signing in with Apple (iOS only), Google or an
 * email code upgrades it in place so purchases and AI history follow the user. Sign-in is only
 * for backup/restore: the app works fully without it.
 */
import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { attachLocalRows, detachLocalRows } from '@/db/ownership';
import { setRowOwner } from '@/db/owner';
import { randomHex, uuidv7 } from '@/lib/ids';

import { api, isApiError } from './api';
import { emitSessionEvent, onSessionEvent } from './sessionEvents';
import { kv } from './storage';
import {
  clearSession,
  loadSession,
  saveSession,
  sessionFromResponse,
  type ApiUser,
  type TokenResponse,
} from './tokens';

export type AuthProvider = 'apple' | 'google' | 'email';
export type AuthStatus = 'loading' | 'signedOut' | 'anonymous' | 'signedIn';

type AuthState = {
  status: AuthStatus;
  user: ApiUser | null;
  provider: AuthProvider | null;
};

export const useAuth = create<AuthState>(() => ({ status: 'loading', user: null, provider: null }));

/** The account rows sync to, or null (signed out or anonymous: anonymous accounts never sync). */
export function syncAccountId(): string | null {
  const { status, user } = useAuth.getState();
  return status === 'signedIn' && user ? user.id : null;
}

const DEVICE_KEY = 'auth.deviceId';
const PROVIDER_KEY = 'auth.provider';
/**
 * Billing's cached entitlement (MMKV keys). Cleared on sign-out/deletion; billing should also
 * listen to onSessionEvent for its in-memory state.
 */
export const ENTITLEMENT_CACHE_KEYS = ['billing.entitlement'] as const;

export function deviceId(): string {
  let id = kv.getString(DEVICE_KEY);
  if (!id) {
    id = uuidv7();
    kv.set(DEVICE_KEY, id);
  }
  return id;
}

function applyUser(user: ApiUser | null, provider: AuthProvider | null = null): void {
  if (!user) {
    setRowOwner(null);
    useAuth.setState({ status: 'signedOut', user: null, provider: null });
    return;
  }
  setRowOwner(user.anonymous ? null : user.id);
  useAuth.setState({
    status: user.anonymous ? 'anonymous' : 'signedIn',
    user,
    provider: user.anonymous ? null : provider,
  });
}

function storedProvider(): AuthProvider | null {
  const p = kv.getString(PROVIDER_KEY);
  return p === 'apple' || p === 'google' || p === 'email' ? p : null;
}

let unsubscribe: (() => void) | null = null;
let initPromise: Promise<void> | null = null;

/** Load the stored session (secure store) once. Non-blocking for the UI: call and forget. */
export function initAuth(): Promise<void> {
  if (!unsubscribe) {
    // Refresh token rejected by the server → signed out of sync, local data stays (sheet 14).
    unsubscribe = onSessionEvent((e) => {
      if (e.type === 'signedOut' && e.reason === 'expired') localSignOut();
    });
  }
  if (!initPromise) {
    initPromise = loadSession()
      .then((s) => applyUser(s?.user ?? null, storedProvider()))
      .catch(() => applyUser(null));
  }
  return initPromise;
}

let anonInflight: Promise<ApiUser> | null = null;

/**
 * Make sure a Worker account exists (anonymous if needed) before calling /ai or /billing.
 * Single-flight: the Worker limits anonymous accounts to 10/h/IP.
 */
export async function ensureSession(): Promise<ApiUser> {
  await initAuth();
  const s = await loadSession();
  if (s) return s.user;
  if (!anonInflight) {
    anonInflight = (async () => {
      const res = await api.post<TokenResponse>('/auth/anonymous', { deviceId: deviceId() });
      await saveSession(sessionFromResponse(res, Date.now()));
      applyUser(res.user);
      emitSessionEvent({ type: 'signedIn', userId: res.user.id, anonymous: true });
      return res.user;
    })().finally(() => {
      anonInflight = null;
    });
  }
  return anonInflight;
}

/** Finish any sign-in: store tokens, adopt local rows, start a full sync (via the event). */
async function completeSignIn(res: TokenResponse, provider: AuthProvider): Promise<ApiUser> {
  await saveSession(sessionFromResponse(res, Date.now()));
  kv.set(PROVIDER_KEY, provider);
  // Rows written while signed out / anonymous now belong to this account and get backed up.
  attachLocalRows(res.user.id);
  applyUser(res.user, provider);
  emitSessionEvent({ type: 'signedIn', userId: res.user.id, anonymous: false });
  return res.user;
}

export type SignInResult = { ok: true; user: ApiUser } | { ok: false; cancelled: true };

const CANCELLED: SignInResult = { ok: false, cancelled: true };

/** Sign in with Apple is offered on iOS only (App Store rule 4.8); Android hides it. */
export function isAppleSignInSupported(os: string = Platform.OS): boolean {
  return os === 'ios';
}

export async function isAppleSignInAvailable(): Promise<boolean> {
  if (!isAppleSignInSupported()) return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function signInWithApple(): Promise<SignInResult> {
  if (!isAppleSignInSupported()) throw new Error('apple_unsupported');
  await initAuth();
  const rawNonce = randomHex(16);
  const hashedNonce = await digestStringAsync(CryptoDigestAlgorithm.SHA256, rawNonce);
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return CANCELLED;
    throw e;
  }
  if (!credential.identityToken) throw new Error('apple_no_token');
  const res = await api.post<TokenResponse>(
    '/auth/apple',
    { identityToken: credential.identityToken, nonce: rawNonce, deviceId: deviceId() },
    { auth: 'optional' },
  );
  return { ok: true, user: await completeSignIn(res, 'apple') };
}

let googleConfigured = false;

export function isGoogleSignInConfigured(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID);
}

export async function signInWithGoogle(): Promise<SignInResult> {
  await initAuth();
  if (!googleConfigured) {
    GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      scopes: ['email'],
    });
    googleConfigured = true;
  }
  let idToken: string | null;
  try {
    if (Platform.OS === 'android')
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const r = await GoogleSignin.signIn();
    if (r.type !== 'success') return CANCELLED;
    idToken = r.data.idToken;
  } catch (e) {
    if (
      isErrorWithCode(e) &&
      (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS)
    ) {
      return CANCELLED;
    }
    throw e;
  }
  if (!idToken) throw new Error('google_no_token');
  const res = await api.post<TokenResponse>(
    '/auth/google',
    { idToken, deviceId: deviceId() },
    { auth: 'optional' },
  );
  return { ok: true, user: await completeSignIn(res, 'google') };
}

export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/;

export function normaliseEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase();
  return e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}

/** Step 1 of the email fallback: the Worker mails a 6-digit code (same reply for any email). */
export async function startEmailSignIn(email: string): Promise<{ expiresIn: number }> {
  const e = normaliseEmail(email);
  if (!e) throw new Error('invalid_email');
  return api.post<{ ok: true; expiresIn: number }>('/auth/email/start', { email: e });
}

export async function verifyEmailCode(email: string, code: string): Promise<SignInResult> {
  await initAuth();
  const e = normaliseEmail(email);
  if (!e) throw new Error('invalid_email');
  const c = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) throw new Error('invalid_code');
  const res = await api.post<TokenResponse>(
    '/auth/email/verify',
    { email: e, code: c, deviceId: deviceId() },
    { auth: 'optional' },
  );
  return { ok: true, user: await completeSignIn(res, 'email') };
}

/** Local half of sign-out: tokens, cached entitlement, row ownership. Data on the phone stays. */
function localSignOut(): void {
  for (const k of ENTITLEMENT_CACHE_KEYS) kv.remove(k);
  kv.remove(PROVIDER_KEY);
  detachLocalRows();
  applyUser(null);
}

/**
 * Sign out: revoke the refresh family (best effort, never blocks on the network), clear tokens
 * and the cached entitlement, and detach local rows from the account. Local data stays.
 */
export async function signOut(): Promise<void> {
  const s = await loadSession();
  await clearSession();
  localSignOut();
  emitSessionEvent({ type: 'signedOut', reason: 'user' });
  if (s) {
    api
      .post('/auth/logout', { refreshToken: s.refreshToken }, { timeoutMs: 5000 })
      .catch(() => undefined);
  }
  if (Platform.OS !== 'web') GoogleSignin.signOut().catch(() => undefined);
}

/**
 * Delete the Worker account and ALL its server data (DELETE /account). Needs the network: on
 * failure nothing changes locally and the error is rethrown for the UI. Data on this phone stays,
 * detached from any account. Store subscriptions are not cancelled by this (the UI says so).
 */
export async function deleteAccount(): Promise<void> {
  try {
    await api.delete('/account', { auth: 'required' });
  } catch (e) {
    // Already gone server-side (e.g. deleted from the web page): finish the local part.
    if (!(isApiError(e) && e.kind === 'unauthorized' && e.code !== 'no_session')) throw e;
  }
  await clearSession();
  localSignOut();
  emitSessionEvent({ type: 'signedOut', reason: 'deleted' });
}

/** Tests only. */
export function resetAuthForTests(): void {
  unsubscribe?.();
  unsubscribe = null;
  initPromise = null;
  anonInflight = null;
  googleConfigured = false;
  useAuth.setState({ status: 'loading', user: null, provider: null });
}
