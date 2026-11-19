import type { ComponentType } from 'react';

import {
  initCrashReporting,
  resetCrashForTests,
  scrubBreadcrumb,
  scrubEvent,
  stripQuery,
  withCrashReporting,
} from '../crash';
import { usePrivacyStore } from '../privacy';

const Root: ComponentType<Record<string, unknown>> = () => null;

function fakeSdk() {
  const Wrapped: ComponentType<Record<string, unknown>> = () => null;
  return { init: jest.fn(), wrap: jest.fn(() => Wrapped), Wrapped };
}

beforeEach(() => {
  delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  usePrivacyStore.setState({ shareUsageData: true });
  resetCrashForTests();
});

it('is a no-op without a DSN: no init, root returned unwrapped', () => {
  const sdk = fakeSdk();
  expect(initCrashReporting({ sdk })).toBe(false);
  expect(initCrashReporting()).toBe(false);
  expect(sdk.init).not.toHaveBeenCalled();
  expect(withCrashReporting(Root)).toBe(Root);
});

it('inits with no PII and wraps the root when a DSN is set', () => {
  const sdk = fakeSdk();
  expect(initCrashReporting({ dsn: 'https://k@o.ingest.sentry.io/1', sdk })).toBe(true);
  const opts = sdk.init.mock.calls[0][0];
  expect(opts).toMatchObject({ sendDefaultPii: false, attachScreenshot: false, attachViewHierarchy: false });
  expect(withCrashReporting(Root)).toBe(sdk.Wrapped);
  // beforeSend drops the user and honours a later opt-out.
  expect(opts.beforeSend({ user: { id: 'u' }, message: 'x' })).toEqual({ message: 'x' });
  usePrivacyStore.setState({ shareUsageData: false });
  expect(opts.beforeSend({ message: 'x' })).toBeNull();
});

it('does not start when the user opted out before launch', () => {
  usePrivacyStore.setState({ shareUsageData: false });
  const sdk = fakeSdk();
  expect(initCrashReporting({ dsn: 'https://k@o.ingest.sentry.io/1', sdk })).toBe(false);
  expect(sdk.init).not.toHaveBeenCalled();
});

it('never throws if the SDK fails', () => {
  const sdk = {
    init: () => {
      throw new Error('boom');
    },
    wrap: jest.fn(),
  };
  expect(initCrashReporting({ dsn: 'x', sdk })).toBe(false);
  expect(withCrashReporting(Root)).toBe(Root);
});

it('scrubs breadcrumbs: drops console/input, strips queries, bodies and health values', () => {
  expect(scrubBreadcrumb({ category: 'console', message: 'weight 80' })).toBeNull();
  expect(scrubBreadcrumb({ category: 'ui.input' })).toBeNull();
  expect(
    scrubBreadcrumb({
      category: 'http',
      message: 'GET https://api.x/v1/foods?q=chicken',
      data: { url: 'https://api.x/v1/foods?q=chicken', method: 'GET', status_code: 200, body: '{}', kcal: 500 },
    }),
  ).toEqual({
    category: 'http',
    message: 'GET https://api.x/v1/foods',
    data: { url: 'https://api.x/v1/foods', method: 'GET', status_code: 200 },
  });
  expect(
    scrubBreadcrumb({ category: 'navigation', data: { from: '/a?x=1', to: '/workout/abc', params: { id: 1 } } }),
  ).toEqual({ category: 'navigation', data: { from: '/a', to: '/workout/abc' } });
});

it('scrubs events: no user, no server name, request reduced to a query-less url', () => {
  expect(
    scrubEvent(
      {
        user: { email: 'a@b.c' },
        server_name: 'phone',
        request: { url: 'https://x/y?token=1', cookies: 'c', headers: { a: '1' } },
        extra: { weight: 80, screen: 'today' },
        breadcrumbs: [{ category: 'console' }, { category: 'navigation', data: { to: '/today' } }],
      },
      true,
    ),
  ).toEqual({
    request: { url: 'https://x/y' },
    extra: { screen: 'today' },
    breadcrumbs: [{ category: 'navigation', data: { to: '/today' } }],
  });
  expect(stripQuery('/a#b')).toBe('/a');
});
