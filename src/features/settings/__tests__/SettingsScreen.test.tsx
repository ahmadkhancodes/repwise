/* eslint-disable @typescript-eslint/no-require-imports */
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Linking, Platform } from 'react-native';

import { getRawDb, resetDbForTests } from '@/db/client';
import { migrateDb } from '@/db/migrate';
import { useOnboarding } from '@/features/onboarding/store';
import { resetBillingState, useBillingStore } from '@/services/billing';
import { usePrivacyStore } from '@/services/privacy';
import { kv } from '@/services/storage';
import { useThemeStore } from '@/theme';
import { useToastStore } from '@/ui';

import { renderThemed, SCHEMES } from '../../../../test/render';
import { DeleteDataSheet } from '../components/DeleteDataSheet';
import { exportAllData, readAllTables, wipeLocalData } from '../data';
import { DEFAULT_APP_PREFS, useAppPrefs } from '../prefs';
import { getProfile, saveProfile } from '../repo';
import { HelpScreen } from '../screens/HelpScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.2.3' } } }));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-file-system', () => {
  const files = new Map<string, string>();
  class File {
    uri: string;
    constructor(...parts: { uri?: string }[] | string[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : (p.uri ?? ''))).join('/');
    }
    get exists() {
      return files.has(this.uri);
    }
    create() {
      files.set(this.uri, '');
    }
    delete() {
      files.delete(this.uri);
    }
    write(s: string) {
      files.set(this.uri, s);
    }
    get name() {
      return this.uri.split('/').pop() ?? '';
    }
  }
  class Directory extends File {
    override get exists() {
      return [...files.keys()].some((k) => k.startsWith(this.uri));
    }
    override delete() {
      for (const k of [...files.keys()]) if (k.startsWith(this.uri)) files.delete(k);
    }
    list() {
      return [...files.keys()]
        .filter((k) => k.startsWith(`${this.uri}/`) && !k.slice(this.uri.length + 1).includes('/'))
        .map((k) => new File(k));
    }
  }
  return { File, Directory, Paths: { cache: { uri: 'cache' }, document: { uri: 'doc' } }, __files: files };
});

const sharing = require('expo-sharing') as { isAvailableAsync: jest.Mock; shareAsync: jest.Mock };
const fsMock = require('expo-file-system') as { __files: Map<string, string> };
const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);

function seedProfile() {
  saveProfile({
    goal: 'fat_loss',
    sex: 'female',
    birthYear: 1990,
    heightCm: 168,
    weightKg: 70,
    experience: 'beginner',
    days: 4,
    sessionMin: 60,
    equipment: ['bodyweight', 'barbell', 'dumbbell'],
    units: 'metric',
  });
}

beforeEach(async () => {
  resetDbForTests();
  await migrateDb();
  jest.clearAllMocks();
  resetBillingState();
  usePrivacyStore.setState({ shareUsageData: true });
  useAppPrefs.setState({ ...DEFAULT_APP_PREFS });
  useThemeStore.getState().setPreference('system');
  fsMock.__files.clear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe.each(SCHEMES)(`SettingsScreen (%s, ${Platform.OS})`, (scheme) => {
  it('renders every group, the profile card and the version', async () => {
    seedProfile();
    await renderThemed(<SettingsScreen />, scheme);
    expect(await screen.findByTestId('screen-settings')).toBeTruthy();
    expect(await screen.findByText('Lose fat')).toBeTruthy();
    expect(screen.getByTestId('profile-line')).toHaveTextContent('4 days · 60 min · Gym');
    for (const id of [
      'units',
      'theme',
      'toggle-keep-awake',
      'toggle-rest-sound',
      'toggle-rest-vibration',
      'open-notifications',
      'open-account',
      'toggle-share-usage',
      'open-privacy',
      'export-data',
      'delete-data',
      'open-help',
      'open-terms',
    ]) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    expect(screen.getByTestId('app-version')).toHaveTextContent('Repwise 1.2.3');
    // Payments off: no subscription rows.
    expect(screen.queryByTestId('open-subscription')).toBeNull();
    expect(screen.queryByTestId('restore-purchases')).toBeNull();
  });
});

describe(`SettingsScreen interactions (${Platform.OS})`, () => {
  it('empty: without a profile the card invites setup', async () => {
    await renderThemed(<SettingsScreen />);
    expect(await screen.findByText('Set up your plan')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('open-profile'));
    expect(router.push).toHaveBeenCalledWith('/welcome');
  });

  it('profile card opens the plan editor', async () => {
    seedProfile();
    await renderThemed(<SettingsScreen />);
    await screen.findByText('Lose fat');
    await fireEvent.press(screen.getByTestId('open-profile'));
    expect(router.push).toHaveBeenCalledWith('/settings/profile');
  });

  it('privacy switch is wired to useShareUsageData', async () => {
    await renderThemed(<SettingsScreen />);
    const sw = await screen.findByRole('switch', { name: /Share anonymous usage data/ });
    expect(sw.props.accessibilityState.checked).toBe(true);
    await fireEvent.press(screen.getByTestId('toggle-share-usage'));
    expect(usePrivacyStore.getState().shareUsageData).toBe(false);
    expect(
      screen.getByRole('switch', { name: /Share anonymous usage data/ }).props.accessibilityState.checked,
    ).toBe(false);
  });

  it('workout switches save device prefs', async () => {
    await renderThemed(<SettingsScreen />);
    await fireEvent.press(await screen.findByTestId('toggle-keep-awake'));
    await fireEvent.press(screen.getByTestId('toggle-rest-sound'));
    expect(useAppPrefs.getState().keepAwake).toBe(false);
    expect(useAppPrefs.getState().restSound).toBe(false);
    expect(useAppPrefs.getState().restVibration).toBe(true);
    expect(JSON.parse(kv.getString('settings.prefs.v1')!).state.keepAwake).toBe(false);
  });

  it('daily steps goal: 8,000 by default, ±500 per tap, saved on the device', async () => {
    const { setStepsGoal, useStepsGoal } = require('@/features/today/stepsGoal');
    setStepsGoal(8000);
    await renderThemed(<SettingsScreen />);
    expect(await screen.findByTestId('group-activity')).toBeTruthy();
    expect(screen.getByTestId('steps-goal-value')).toHaveTextContent('8,000');
    await fireEvent.press(screen.getByTestId('steps-goal-inc'));
    expect(useStepsGoal.getState().goal).toBe(8500);
    expect(kv.getString('steps.goal')).toBe('8500');
    await fireEvent.press(screen.getByTestId('steps-goal-dec'));
    await fireEvent.press(screen.getByTestId('steps-goal-dec'));
    expect(useStepsGoal.getState().goal).toBe(7500);
  });

  it('units and theme', async () => {
    seedProfile();
    await renderThemed(<SettingsScreen />);
    await screen.findByText('Lose fat');
    await fireEvent.press(screen.getByRole('tab', { name: /lb · ft/ }));
    await waitFor(() => expect(getProfile()?.units).toBe('imperial'));
    await fireEvent.press(screen.getByRole('tab', { name: /Dark/ }));
    expect(useThemeStore.getState().preference).toBe('dark');
  });

  it('legal links open the website; help opens S42', async () => {
    await renderThemed(<SettingsScreen />);
    await fireEvent.press(await screen.findByTestId('open-privacy'));
    expect(openURL).toHaveBeenCalledWith('https://repwise.app/privacy');
    await fireEvent.press(screen.getByTestId('open-terms'));
    expect(openURL).toHaveBeenCalledWith('https://repwise.app/terms');
    await fireEvent.press(screen.getByTestId('open-help'));
    expect(router.push).toHaveBeenCalledWith('/settings/help');
  });

  it('export shares a JSON file of every table', async () => {
    seedProfile();
    await renderThemed(<SettingsScreen />);
    await fireEvent.press(await screen.findByTestId('export-data'));
    await waitFor(() => expect(sharing.shareAsync).toHaveBeenCalled());
    const [uri, opts] = sharing.shareAsync.mock.calls[0] as [string, { mimeType: string }];
    expect(uri).toMatch(/^cache\/repwise-export-\d{4}-\d{2}-\d{2}\.json$/);
    expect(opts.mimeType).toBe('application/json');
    const file = JSON.parse(fsMock.__files.get(uri)!) as { tables: Record<string, unknown[]>; counts: Record<string, number> };
    expect(file.counts.profile).toBe(1);
    expect(file.tables.profile![0]).toMatchObject({ goal: 'fat_loss', equipment: ['bodyweight', 'barbell', 'dumbbell'] });
    expect(file.tables.profile![0]).not.toHaveProperty('dirty');
  });

  it('export error: calm toast when sharing is unavailable', async () => {
    sharing.isAvailableAsync.mockResolvedValueOnce(false);
    await renderThemed(<SettingsScreen />);
    await fireEvent.press(await screen.findByTestId('export-data'));
    await waitFor(() =>
      expect(useToastStore.getState().current?.message).toBe("Sharing isn't available on this phone."),
    );
    expect(await exportAllData()).toEqual({ status: 'shared', rows: 0 });
  });

  it('payments on: subscription and restore rows', async () => {
    useBillingStore.setState({ paymentsEnabled: true });
    await renderThemed(<SettingsScreen />);
    expect(await screen.findByTestId('open-subscription')).toBeTruthy();
    expect(screen.getByTestId('restore-purchases')).toBeTruthy();
  });

  it('delete all data: two confirmations, then the sheet hands off to the undo window', async () => {
    await renderThemed(<SettingsScreen />);
    await fireEvent.press(await screen.findByTestId('delete-data'));
    expect(await screen.findByText('Delete all data?')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('delete-data-continue'));
    expect(await screen.findByText('This cannot be undone')).toBeTruthy();
    expect(screen.getByTestId('delete-data-confirm')).toBeTruthy();
  });
});

describe(`DeleteDataSheet (${Platform.OS})`, () => {
  it('undo inside 5 s deletes nothing', async () => {
    jest.useFakeTimers();
    const run = jest.fn(async () => ({ status: 'deleted' as const }));
    await renderThemed(<DeleteDataSheet open onClose={jest.fn()} run={run} />);
    await fireEvent.press(screen.getByTestId('delete-data-continue'));
    await fireEvent.press(screen.getByTestId('delete-data-confirm'));
    expect(useToastStore.getState().current?.actionLabel).toBe('Undo');
    await act(async () => {
      useToastStore.getState().current?.onAction?.();
    });
    await act(async () => {
      jest.advanceTimersByTime(6000);
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('after 5 s it deletes and starts fresh on Welcome', async () => {
    jest.useFakeTimers();
    const run = jest.fn(async () => ({ status: 'deleted' as const }));
    await renderThemed(<DeleteDataSheet open onClose={jest.fn()} run={run} />);
    await fireEvent.press(screen.getByTestId('delete-data-continue'));
    await fireEvent.press(screen.getByTestId('delete-data-confirm'));
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(run).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/welcome'));
  });

  it('a failed server delete shows the error and stays', async () => {
    jest.useFakeTimers();
    const run = jest.fn(async () => ({ status: 'error' as const, error: new Error('x') }));
    await renderThemed(<DeleteDataSheet open onClose={jest.fn()} run={run} />);
    await fireEvent.press(screen.getByTestId('delete-data-continue'));
    await fireEvent.press(screen.getByTestId('delete-data-confirm'));
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    await waitFor(() => expect(useToastStore.getState().current?.tone).toBe('danger'));
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe(`wipeLocalData (${Platform.OS})`, () => {
  it('empties every user table, photos and personal keys; keeps prefs and onboarding resets', () => {
    seedProfile();
    kv.set('water.goal.ml', '2500');
    kv.set('notifications.prefs.v1', '{}');
    fsMock.__files.set('doc/progress-photos/a.jpg', 'x');
    useOnboarding.getState().complete(1);
    wipeLocalData();
    expect(getProfile()).toBeUndefined();
    for (const rows of Object.values(readAllTables())) expect(rows).toHaveLength(0);
    expect(fsMock.__files.has('doc/progress-photos/a.jpg')).toBe(false);
    expect(kv.getString('water.goal.ml')).toBeUndefined();
    expect(kv.getString('notifications.prefs.v1')).toBe('{}');
    expect(useOnboarding.getState().phase).toBe('welcome');
    // migrations bookkeeping is untouched
    expect(getRawDb().getAllSync('SELECT name FROM sqlite_master').length).toBeGreaterThan(0);
  });
});

describe(`wipeLocalData leaves nothing behind (R2-4, ${Platform.OS})`, () => {
  it('deletes every export JSON in the cache, keeps other cache files', () => {
    fsMock.__files.set('cache/repwise-export-2026-11-01.json', '{}');
    fsMock.__files.set('cache/repwise-export-2026-11-19.json', '{}');
    fsMock.__files.set('cache/other.bin', 'x');
    wipeLocalData();
    expect(fsMock.__files.has('cache/repwise-export-2026-11-01.json')).toBe(false);
    expect(fsMock.__files.has('cache/repwise-export-2026-11-19.json')).toBe(false);
    expect(fsMock.__files.has('cache/other.bin')).toBe(true);
  });

  it('stops a running rest timer, its persisted copy and the "Rest over" alert', async () => {
    const { restTimer } = require('@/features/workout/restTimerStore') as typeof import('@/features/workout/restTimerStore');
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');
    const cancel = jest.spyOn(Notifications, 'cancelScheduledNotificationAsync');
    restTimer.start('s1', 90, null, Date.now());
    expect(kv.getString('workout.restTimer.v1')).toBeDefined();
    wipeLocalData();
    expect(restTimer.getState().status).toBe('idle');
    expect(kv.getString('workout.restTimer.v1')).toBeUndefined();
    await waitFor(() => expect(cancel).toHaveBeenCalledWith('rw:rest'));
    cancel.mockRestore();
  });
});

describe(`HelpScreen (${Platform.OS})`, () => {
  it.each(SCHEMES)('renders help, legal and delete rows (%s)', async (scheme) => {
    await renderThemed(<HelpScreen />, scheme);
    expect(await screen.findByTestId('screen-help')).toBeTruthy();
    expect(screen.queryByTestId('help-delete-account')).toBeNull(); // not signed in
    await fireEvent.press(screen.getByTestId('help-email'));
    expect(openURL).toHaveBeenCalledWith(expect.stringMatching(/^mailto:/));
    await fireEvent.press(screen.getByTestId('help-terms'));
    expect(openURL).toHaveBeenCalledWith('https://repwise.app/terms');
    await fireEvent.press(screen.getByTestId('help-delete-data'));
    expect(await screen.findByText('Delete all data?')).toBeTruthy();
  });
});
