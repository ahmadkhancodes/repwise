/* eslint-disable @typescript-eslint/no-require-imports */
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { resetDbForTests } from '@/db/client';
import { migrateDb } from '@/db/migrate';
import { resetBillingState, useBillingStore } from '@/services/billing';
import { resetNotificationsForTests, useNotificationsStore } from '@/services/notifications';
import { kv } from '@/services/storage';

import { __state } from '../../../../test/mocks/expoNotifications';
import { renderThemed, SCHEMES } from '../../../../test/render';
import { reloadPrefsForTests, useNotificationPrefs } from '../prefsStore';
import { NotificationSettingsScreen } from '../screens/NotificationSettingsScreen';

jest.mock('expo-notifications', () => require('../../../../test/mocks/expoNotifications'));
jest.mock('react-native-android-widget', () => require('../../../../test/mocks/androidWidget'));
jest.mock('@bacons/apple-targets', () => ({
  ExtensionStorage: Object.assign(jest.fn().mockImplementation(() => ({ set: jest.fn() })), { reloadWidget: jest.fn() }),
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));

const N = jest.requireMock('expo-notifications') as typeof import('../../../../test/mocks/expoNotifications');

beforeEach(async () => {
  resetDbForTests();
  await migrateDb();
  __state.reset();
  jest.clearAllMocks();
  resetNotificationsForTests();
  resetBillingState();
  kv.remove('notifications.prefs.v1');
  reloadPrefsForTests();
  // Pretend the schedule was already built so mounting does not rebuild.
  useNotificationsStore.setState({ status: 'ready' });
});

describe.each(SCHEMES)('NotificationSettingsScreen (%s)', (scheme) => {
  it('granted: shows every reminder toggle and times, no primary button', async () => {
    await renderThemed(<NotificationSettingsScreen />, scheme);
    expect(await screen.findByTestId('toggle-brief')).toBeTruthy();
    for (const id of ['toggle-meals', 'toggle-workout', 'toggle-fuel', 'toggle-evening', 'toggle-checkin', 'toggle-quiet']) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    expect(screen.getByTestId('time-lunch')).toBeTruthy();
    expect(screen.queryByTestId('turn-on')).toBeNull();
    expect(screen.queryByTestId('toggle-trial')).toBeNull(); // payments off
    expect(screen.getByRole('switch', { name: /Morning brief/ }).props.accessibilityState.checked).toBe(true);
  });
});

describe('NotificationSettingsScreen', () => {
  it('loading: skeleton while the permission is unknown', async () => {
    N.getPermissionsAsync.mockImplementationOnce(() => new Promise(() => undefined));
    await renderThemed(<NotificationSettingsScreen />);
    expect(screen.getByTestId('notifications-loading')).toBeTruthy();
  });

  it('off: explains and asks for permission with one primary button', async () => {
    __state.permission = { granted: false, status: 'undetermined', canAskAgain: true };
    await renderThemed(<NotificationSettingsScreen />);
    expect(await screen.findByTestId('permission-card')).toBeTruthy();
    expect(screen.getByText('Notifications are off')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('turn-on'));
    await waitFor(() => expect(N.requestPermissionsAsync).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('turn-on')).toBeNull());
  });

  it('toggling a reminder saves the preference', async () => {
    await renderThemed(<NotificationSettingsScreen />);
    const row = await screen.findByTestId('toggle-meals');
    await fireEvent.press(row);
    expect(useNotificationPrefs.getState().prefs.meals).toBe(false);
    expect(JSON.parse(kv.getString('notifications.prefs.v1')!).meals).toBe(false);
    expect(screen.getByRole('switch', { name: /Meal reminders/ }).props.accessibilityState.checked).toBe(false);
  });

  it('quiet hours: turning off hides the From/To rows', async () => {
    await renderThemed(<NotificationSettingsScreen />);
    expect(await screen.findByTestId('time-quiet-start')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('toggle-quiet'));
    expect(screen.queryByTestId('time-quiet-start')).toBeNull();
  });

  it('editing a time opens the picker sheet and saves', async () => {
    await renderThemed(<NotificationSettingsScreen />);
    await fireEvent.press(await screen.findByTestId('time-workout'));
    expect(await screen.findByTestId('time-save')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('time-save'));
    expect(useNotificationPrefs.getState().prefs.workoutTime).toBe('18:00');
  });

  it('next up card shows the soonest reminder', async () => {
    await renderThemed(<NotificationSettingsScreen />);
    await screen.findByTestId('toggle-brief');
    await act(async () => {
      useNotificationsStore.setState({
        scheduled: [
          {
            key: 'k',
            kind: 'meal',
            at: Date.now() + 3_600_000,
            title: 'Lunch time 🍽',
            body: 'Chicken bowl · 600 kcal',
            channelId: 'meals',
            categoryId: 'meal',
            data: { kind: 'meal', url: '/eat' },
          },
        ],
      });
    });
    expect(screen.getByTestId('next-up')).toBeTruthy();
    expect(screen.getByText('Lunch time 🍽')).toBeTruthy();
  });

  it('error: calm retry state', async () => {
    await renderThemed(<NotificationSettingsScreen />);
    await screen.findByTestId('toggle-brief');
    await act(async () => {
      useNotificationsStore.setState({ status: 'error', error: 'x' });
    });
    expect(screen.getByTestId('notifications-error')).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('Pro reminders show a Pro badge for free users and open the paywall', async () => {
    useBillingStore.setState({ paymentsEnabled: true, entitlement: null });
    await renderThemed(<NotificationSettingsScreen />);
    const row = await screen.findByTestId('toggle-meals');
    expect(screen.getByTestId('toggle-trial')).toBeTruthy();
    await fireEvent.press(row);
    expect(router.push).toHaveBeenCalledWith('/paywall');
    expect(useNotificationPrefs.getState().prefs.meals).toBe(true);
  });

  it('back button', async () => {
    await renderThemed(<NotificationSettingsScreen />);
    await fireEvent.press(await screen.findByLabelText('Back'));
    expect(router.back).toHaveBeenCalled();
  });
});
