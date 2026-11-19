import { track, resetAnalyticsForTests, setAnalyticsSink } from '../analytics';
import { createPostHogSink, resetPostHogForTests, type PostHogLike } from '../posthog';
import { isUsageSharingOn, usePrivacyStore } from '../privacy';

function fakeClient(): PostHogLike & { capture: jest.Mock; optIn: jest.Mock; optOut: jest.Mock; reset: jest.Mock } {
  return { capture: jest.fn(), optIn: jest.fn(), optOut: jest.fn(), reset: jest.fn() };
}

beforeEach(() => {
  delete process.env.EXPO_PUBLIC_POSTHOG_KEY;
  usePrivacyStore.setState({ shareUsageData: true });
});
afterEach(() => {
  resetPostHogForTests();
  resetAnalyticsForTests();
});

it('is a no-op without a key (never creates a client)', () => {
  const createClient = jest.fn();
  expect(createPostHogSink({ createClient })).toBeNull();
  expect(createPostHogSink()).toBeNull();
  expect(createClient).not.toHaveBeenCalled();
});

it('defaults usage sharing to ON (sheet 23)', () => {
  usePrivacyStore.persist.clearStorage();
  expect(usePrivacyStore.getInitialState().shareUsageData).toBe(true);
});

it('sends events with health values stripped', () => {
  const c = fakeClient();
  const sink = createPostHogSink({ key: 'phc_test', createClient: () => c });
  expect(sink).not.toBeNull();
  setAnalyticsSink(sink);
  track('checkin_done', { kcal_change_bucket: 'up_small', weight: 80, kcal: 2400 });
  expect(c.capture).toHaveBeenCalledWith('checkin_done', { kcal_change_bucket: 'up_small' });
});

it('uses the given host and the default host otherwise', () => {
  const createClient = jest.fn(() => fakeClient());
  createPostHogSink({ key: 'k', host: 'https://eu.i.posthog.com', createClient });
  expect(createClient).toHaveBeenLastCalledWith('k', 'https://eu.i.posthog.com');
  createPostHogSink({ key: 'k', createClient });
  expect(createClient).toHaveBeenLastCalledWith('k', 'https://us.i.posthog.com');
});

it('respects the Settings opt-out at runtime and at start', () => {
  const c = fakeClient();
  const sink = createPostHogSink({ key: 'k', createClient: () => c })!;
  usePrivacyStore.getState().setShareUsageData(false);
  expect(isUsageSharingOn()).toBe(false);
  expect(c.optOut).toHaveBeenCalledTimes(1);
  expect(c.reset).toHaveBeenCalledTimes(1);
  sink('app_open', { source: 'cold' });
  expect(c.capture).not.toHaveBeenCalled();
  usePrivacyStore.getState().setShareUsageData(true);
  expect(c.optIn).toHaveBeenCalledTimes(1);
  sink('app_open', { source: 'warm' });
  expect(c.capture).toHaveBeenCalledWith('app_open', { source: 'warm' });

  resetPostHogForTests();
  usePrivacyStore.setState({ shareUsageData: false });
  const c2 = fakeClient();
  createPostHogSink({ key: 'k', createClient: () => c2 });
  expect(c2.optOut).toHaveBeenCalled();
});

it('returns null if the SDK fails to start', () => {
  expect(
    createPostHogSink({
      key: 'k',
      createClient: () => {
        throw new Error('native module missing');
      },
    }),
  ).toBeNull();
});
