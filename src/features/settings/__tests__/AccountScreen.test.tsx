import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { createFakeFetch, tokenResponse } from '../../../../test/fakeFetch';
import { renderThemed, SCHEMES } from '../../../../test/render';

import { resetDbForTests } from '@/db/client';
import { migrateDb } from '@/db/migrate';
import { configureApi, resetApiForTests } from '@/services/api';
import { initAuth, resetAuthForTests, useAuth, verifyEmailCode } from '@/services/auth';
import { resetTokensForTests } from '@/services/tokens';

import { AccountScreen } from '../screens/AccountScreen';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const secureStore = require('expo-secure-store') as { __reset: () => void };
let fake: ReturnType<typeof createFakeFetch>;

beforeEach(async () => {
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'web-client';
  secureStore.__reset();
  resetTokensForTests();
  resetApiForTests();
  resetAuthForTests();
  resetDbForTests();
  await migrateDb();
  fake = createFakeFetch();
  configureApi({ baseUrl: fake.base, fetch: fake.fetch });
  fake.on('POST /auth/email/start', () => ({ status: 200, body: { ok: true, expiresIn: 600 } }));
  fake.on('POST /auth/email/verify', () => ({ status: 200, body: tokenResponse('e', { email: 'me@x.co' }) }));
  fake.on('DELETE /account', () => ({ status: 204 }));
  fake.on('POST /auth/logout', () => ({ status: 204 }));
  fake.on('GET /sync/pull', () => ({ status: 200, body: { changes: {}, nextCursor: null, nextSince: 0, serverTime: 0 } }));
  await initAuth();
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
});

describe.each(SCHEMES)('AccountScreen (%s)', (scheme) => {
  it(`shows Sign in with Apple only on iOS (running as ${Platform.OS})`, async () => {
    await renderThemed(<AccountScreen />, scheme);
    expect(await screen.findByTestId('screen-account')).toBeTruthy();
    if (Platform.OS === 'ios') {
      expect(await screen.findByTestId('apple-sign-in')).toBeTruthy();
    } else {
      await waitFor(() => expect(screen.getByTestId('google-sign-in')).toBeTruthy());
      expect(screen.queryByTestId('apple-sign-in')).toBeNull();
    }
    expect(screen.getByTestId('google-sign-in')).toBeTruthy();
    expect(screen.getByTestId('email-sign-in')).toBeTruthy();
  });
});

describe('AccountScreen flows', () => {
  it('email code sign-in', async () => {
    await renderThemed(<AccountScreen />);
    await fireEvent.press(await screen.findByTestId('email-sign-in'));
    await fireEvent.changeText(screen.getByTestId('email-input'), 'me@x.co');
    await fireEvent.press(screen.getByTestId('send-code'));
    expect(await screen.findByTestId('code-input')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('code-input'), '12a3456');
    await fireEvent.press(screen.getByTestId('verify-code'));
    await waitFor(() => expect(useAuth.getState().status).toBe('signedIn'));
    expect(fake.callsTo('POST /auth/email/verify')[0]!.body).toMatchObject({ code: '123456' });
    expect(await screen.findByTestId('account-email')).toBeTruthy();
  });

  it('shows a readable error when the code is wrong', async () => {
    fake.on('POST /auth/email/verify', () => ({ status: 401, body: { error: 'invalid_code' } }));
    await renderThemed(<AccountScreen />);
    await fireEvent.press(await screen.findByTestId('email-sign-in'));
    await fireEvent.changeText(screen.getByTestId('email-input'), 'me@x.co');
    await fireEvent.press(screen.getByTestId('send-code'));
    await fireEvent.changeText(await screen.findByTestId('code-input'), '000000');
    await fireEvent.press(screen.getByTestId('verify-code'));
    expect((await screen.findByTestId('account-error')).props.children).toMatch(/code isn't right/);
  });

  it('delete account asks for confirmation, then deletes', async () => {
    await verifyEmailCode('me@x.co', '123456');
    await renderThemed(<AccountScreen />);
    await fireEvent.press(await screen.findByTestId('delete-account'));
    expect(fake.callsTo('DELETE /account')).toHaveLength(0);
    await fireEvent.press(await screen.findByTestId('confirm-delete'));
    await waitFor(() => expect(useAuth.getState().status).toBe('signedOut'));
    expect(fake.callsTo('DELETE /account')).toHaveLength(1);
  });

  it('sign out returns to the sign-in options', async () => {
    await verifyEmailCode('me@x.co', '123456');
    await renderThemed(<AccountScreen />);
    await fireEvent.press(await screen.findByTestId('sign-out'));
    expect(await screen.findByTestId('email-sign-in')).toBeTruthy();
  });
});
