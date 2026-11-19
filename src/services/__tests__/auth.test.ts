import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import { digestStringAsync } from 'expo-crypto';
import { Platform } from 'react-native';

import { createFakeFetch, tokenResponse } from '../../../test/fakeFetch';

import { resetDbForTests } from '@/db/client';
import { migrateDb } from '@/db/migrate';
import { getRowOwner } from '@/db/owner';
import { sessionsRepo } from '@/features/workout/repo';
import { configureApi, resetApiForTests } from '@/services/api';
import {
  deleteAccount,
  ensureSession,
  initAuth,
  isAppleSignInSupported,
  normaliseEmail,
  resetAuthForTests,
  signInWithApple,
  signInWithGoogle,
  signOut,
  startEmailSignIn,
  syncAccountId,
  useAuth,
  verifyEmailCode,
} from '@/services/auth';
import { emitSessionEvent, onSessionEvent, type SessionEvent } from '@/services/sessionEvents';
import { kv } from '@/services/storage';
import { loadSession, peekSession, resetTokensForTests } from '@/services/tokens';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const secureStore = require('expo-secure-store') as { __reset: () => void };

let fake: ReturnType<typeof createFakeFetch>;
let events: SessionEvent[];
let offEvents: () => void;

beforeEach(async () => {
  jest.clearAllMocks();
  secureStore.__reset();
  resetTokensForTests();
  resetApiForTests();
  resetAuthForTests();
  resetDbForTests();
  await migrateDb();
  kv.remove('billing.entitlement.v1');
  fake = createFakeFetch();
  configureApi({ baseUrl: fake.base, fetch: fake.fetch });
  fake.on('POST /auth/anonymous', () => ({
    status: 201,
    body: tokenResponse('anon', { id: 'anon-1', anonymous: true }),
  }));
  fake.on('POST /auth/google', () => ({
    status: 200,
    body: tokenResponse('g', { id: 'user-1', email: 'g@x.co' }),
  }));
  fake.on('POST /auth/apple', () => ({ status: 200, body: tokenResponse('a', { id: 'user-1' }) }));
  fake.on('POST /auth/email/start', () => ({ status: 200, body: { ok: true, expiresIn: 600 } }));
  fake.on('POST /auth/email/verify', () => ({
    status: 200,
    body: tokenResponse('e', { id: 'user-1', email: 'me@x.co' }),
  }));
  fake.on('POST /auth/logout', () => ({ status: 204 }));
  fake.on('DELETE /account', () => ({ status: 204 }));
  events = [];
  offEvents = onSessionEvent((e) => events.push(e));
  await initAuth();
});

afterEach(() => offEvents());

describe('anonymous session (sheet 15)', () => {
  it('starts signed out with no network call', () => {
    expect(useAuth.getState().status).toBe('signedOut');
    expect(fake.calls).toHaveLength(0);
  });

  it('ensureSession creates ONE silent account for concurrent callers', async () => {
    const [a, b] = await Promise.all([ensureSession(), ensureSession()]);
    expect(a.id).toBe('anon-1');
    expect(b.id).toBe('anon-1');
    expect(fake.callsTo('POST /auth/anonymous')).toHaveLength(1);
    expect((fake.calls[0]!.body as { deviceId: string }).deviceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(useAuth.getState().status).toBe('anonymous');
    expect(syncAccountId()).toBeNull(); // anonymous accounts never sync
    expect(getRowOwner()).toBeNull();
    await ensureSession();
    expect(fake.callsTo('POST /auth/anonymous')).toHaveLength(1);
  });
});

describe('Google', () => {
  it('upgrades the anonymous account and adopts local rows', async () => {
    await ensureSession();
    const local = sessionsRepo.insert({ title: 'before sign-in' });
    expect(local.userId).toBeNull();
    const r = await signInWithGoogle();
    expect(r).toEqual({ ok: true, user: { id: 'user-1', email: 'g@x.co', anonymous: false } });
    const call = fake.callsTo('POST /auth/google')[0]!;
    expect(call.body).toMatchObject({ idToken: 'google-id-token' });
    expect(call.auth).toBe('Bearer at-anon'); // lets the Worker merge the anonymous account
    expect(sessionsRepo.get(local.id)!.userId).toBe('user-1');
    expect(useAuth.getState()).toMatchObject({ status: 'signedIn', provider: 'google' });
    expect(syncAccountId()).toBe('user-1');
    expect(getRowOwner()).toBe('user-1');
    expect(events).toContainEqual({ type: 'signedIn', userId: 'user-1', anonymous: false });
    expect((await loadSession())!.refreshToken).toBe('rt-g');
  });

  it('checks Play services on Android only', async () => {
    await signInWithGoogle();
    expect(GoogleSignin.hasPlayServices).toHaveBeenCalledTimes(Platform.OS === 'android' ? 1 : 0);
  });

  it('cancel is not an error and changes nothing', async () => {
    (GoogleSignin.signIn as jest.Mock).mockResolvedValueOnce({ type: 'cancelled', data: null });
    expect(await signInWithGoogle()).toEqual({ ok: false, cancelled: true });
    (GoogleSignin.signIn as jest.Mock).mockRejectedValueOnce({ code: 'SIGN_IN_CANCELLED' });
    expect(await signInWithGoogle()).toEqual({ ok: false, cancelled: true });
    expect(fake.callsTo('POST /auth/google')).toHaveLength(0);
    expect(useAuth.getState().status).toBe('signedOut');
  });
});

describe('Apple (iOS only)', () => {
  it('is supported on iOS and hidden on Android', () => {
    expect(isAppleSignInSupported('ios')).toBe(true);
    expect(isAppleSignInSupported('android')).toBe(false);
    expect(isAppleSignInSupported()).toBe(Platform.OS === 'ios');
  });

  if (Platform.OS === 'ios') {
    it('sends the identity token and the raw nonce whose sha256 went to Apple', async () => {
      const r = await signInWithApple();
      expect(r.ok).toBe(true);
      const hashed = (AppleAuthentication.signInAsync as jest.Mock).mock.calls[0][0]
        .nonce as string;
      const body = fake.callsTo('POST /auth/apple')[0]!.body as {
        identityToken: string;
        nonce: string;
      };
      expect(body.identityToken).toBe('apple-id-token');
      expect(await digestStringAsync('SHA-256' as never, body.nonce)).toBe(hashed);
      expect(useAuth.getState()).toMatchObject({ status: 'signedIn', provider: 'apple' });
    });

    it('treats the user closing the sheet as a cancel', async () => {
      (AppleAuthentication.signInAsync as jest.Mock).mockRejectedValueOnce({
        code: 'ERR_REQUEST_CANCELED',
      });
      expect(await signInWithApple()).toEqual({ ok: false, cancelled: true });
    });
  } else {
    it('refuses on Android', async () => {
      await expect(signInWithApple()).rejects.toThrow('apple_unsupported');
      expect(AppleAuthentication.signInAsync).not.toHaveBeenCalled();
    });
  }
});

describe('email code', () => {
  it('validates locally, then start + verify', async () => {
    expect(normaliseEmail('  Me@X.co ')).toBe('me@x.co');
    expect(normaliseEmail('nope')).toBeNull();
    await expect(startEmailSignIn('bad')).rejects.toThrow('invalid_email');
    await startEmailSignIn('Me@X.co');
    expect(fake.callsTo('POST /auth/email/start')[0]!.body).toEqual({ email: 'me@x.co' });
    await expect(verifyEmailCode('me@x.co', '12a')).rejects.toThrow('invalid_code');
    const r = await verifyEmailCode('me@x.co', '123 456');
    expect(r.ok).toBe(true);
    expect(fake.callsTo('POST /auth/email/verify')[0]!.body).toMatchObject({
      email: 'me@x.co',
      code: '123456',
    });
    expect(useAuth.getState()).toMatchObject({ status: 'signedIn', provider: 'email' });
  });

  it('surfaces a wrong code as a typed error', async () => {
    fake.on('POST /auth/email/verify', () => ({ status: 401, body: { error: 'invalid_code' } }));
    await expect(verifyEmailCode('me@x.co', '000000')).rejects.toMatchObject({
      kind: 'unauthorized',
      code: 'invalid_code',
    });
    expect(useAuth.getState().status).toBe('signedOut');
  });
});

describe('sign out / delete / expiry', () => {
  beforeEach(async () => {
    await verifyEmailCode('me@x.co', '123456');
    sessionsRepo.insert({ title: 'mine' });
    kv.set('billing.entitlement.v1', '{"pro":true}');
  });

  function expectSignedOutLocally() {
    expect(peekSession()).toBeNull();
    expect(useAuth.getState()).toMatchObject({ status: 'signedOut', user: null });
    expect(kv.getString('billing.entitlement.v1')).toBeUndefined();
    const rows = sessionsRepo.list();
    expect(rows).toHaveLength(1); // data on the phone stays
    expect(rows[0]).toMatchObject({ userId: null, dirty: 1 });
    expect(getRowOwner()).toBeNull();
  }

  it('signOut revokes the refresh family, clears tokens + entitlement, detaches rows', async () => {
    await signOut();
    expectSignedOutLocally();
    await Promise.resolve();
    expect(fake.callsTo('POST /auth/logout')[0]!.body).toEqual({ refreshToken: 'rt-e' });
    expect(events).toContainEqual({ type: 'signedOut', reason: 'user' });
  });

  it('signOut works offline', async () => {
    fake.setOffline(true);
    await signOut();
    expectSignedOutLocally();
  });

  it('deleteAccount calls DELETE /account with the token, then cleans up locally', async () => {
    await deleteAccount();
    const call = fake.callsTo('DELETE /account')[0]!;
    expect(call.auth).toBe('Bearer at-e');
    expectSignedOutLocally();
    expect(events).toContainEqual({ type: 'signedOut', reason: 'deleted' });
  });

  it('deleteAccount offline throws and keeps the account', async () => {
    fake.setOffline(true);
    await expect(deleteAccount()).rejects.toMatchObject({ kind: 'offline' });
    expect(useAuth.getState().status).toBe('signedIn');
    expect(peekSession()).not.toBeNull();
  });

  it('an expired session (refresh rejected) signs out of sync locally', () => {
    emitSessionEvent({ type: 'signedOut', reason: 'expired' });
    expect(useAuth.getState().status).toBe('signedOut');
    expect(sessionsRepo.list()[0]).toMatchObject({ userId: null });
  });
});
