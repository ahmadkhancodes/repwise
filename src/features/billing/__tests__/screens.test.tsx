import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Linking, Platform, Text } from 'react-native';

import { configureBilling, initialBillingState, useBillingStore } from '@/services/billing';
import { kv } from '@/services/storage';
import { colors, useThemeStore } from '@/theme';

import { entitlement, FakeStore, mockApi, os, storePurchase } from '../../../../test/billingFakes';
import { flat } from '../../../../test/render';
import { usePro } from '../hooks/usePro';
import { PaywallScreen } from '../screens/PaywallScreen';
import { SubscriptionScreen } from '../screens/SubscriptionScreen';

/* eslint-disable @typescript-eslint/no-require-imports */
const routes = {
  index: () => <Text testID="home">home</Text>,
  paywall: PaywallScreen,
  'settings/index': require('../../../../app/settings/index').default,
  'settings/subscription': SubscriptionScreen,
};
/* eslint-enable @typescript-eslint/no-require-imports */

const KEYS = [
  'billing.paymentsEnabled.v1',
  'billing.productIds.v1',
  'billing.entitlement.v1',
  'billing.queue.v1',
];
let store: FakeStore;
const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);

async function start(opts: Parameters<typeof mockApi>[0] = {}) {
  store = new FakeStore();
  const svc = configureBilling({ api: mockApi(opts), store, openUrl: (u) => Linking.openURL(u) });
  await act(async () => {
    await svc.init();
  });
  return svc;
}

beforeEach(() => {
  KEYS.forEach((k) => kv.remove(k));
  useBillingStore.setState(initialBillingState(), true);
  useThemeStore.getState().setPreference('light');
  openURL.mockClear();
});

afterAll(async () => {
  await configureBilling({ api: null }).teardown();
});

describe(`paywall (${Platform.OS})`, () => {
  it.each(['light', 'dark'] as const)(
    'renders 4 plans with yearly pre-selected and localised prices (%s)',
    async (scheme) => {
      useThemeStore.getState().setPreference(scheme);
      await start();
      await renderRouter(routes, { initialUrl: '/paywall' });
      expect(await screen.findByTestId('screen-paywall')).toBeTruthy();
      expect(flat(screen.getByTestId('screen-paywall').props.style).backgroundColor).toBe(
        colors[scheme].bg,
      );

      expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
      expect(screen.getByRole('radio', { name: /^Yearly/ })).toBeSelected();
      for (const id of ['quarterly', 'monthly', 'weekly']) {
        expect(screen.getByTestId(`plan-${id}`)).not.toBeSelected();
      }
      expect(screen.getByTestId('plan-yearly-price')).toHaveTextContent('£45.99');
      expect(screen.getByTestId('plan-weekly-price')).toHaveTextContent('£3.99');
      expect(screen.getByText('£0.88/week · 7 days free')).toBeTruthy();
      expect(screen.getByText('Best value')).toBeTruthy();
      expect(screen.getByText('Popular')).toBeTruthy();
      expect(screen.getByTestId('paywall-price-line')).toHaveTextContent(
        '7 days free, then £45.99/year (£0.88/week). Cancel anytime.',
      );
      expect(screen.getByRole('button', { name: 'Start free trial' })).toBeTruthy();
      // Honest trial timeline: today → day 5 reminder → day 7 billed at the store price.
      expect(screen.getByTestId('paywall-timeline')).toBeTruthy();
      expect(screen.getByText('Day 5')).toBeTruthy(); // eyebrow: uppercase by style only
      // One hero title (N7): no second Screen title; direct opens get the generic headline.
      expect(screen.getAllByRole('header')).toHaveLength(1);
      expect(screen.getByTestId('paywall-title')).toHaveTextContent('Train and eat to plan.');
      expect(screen.getByText('Billed £45.99/year')).toBeTruthy();
      expect(screen.getAllByRole('radio')).toHaveLength(4);
      expect(screen.getByTestId('paywall-cancel')).toHaveTextContent(
        os() === 'ios' ? /Subscriptions on your iPhone/ : /Google Play/,
      );
    },
  );

  it('the headline follows where the paywall opened from (N7)', async () => {
    await start();
    await renderRouter(routes, { initialUrl: '/paywall?source=grocery' });
    expect(await screen.findByTestId('paywall-title')).toHaveTextContent(
      'Your grocery list, done.',
    );
  });

  it('switching plan updates the CTA and the plain price line', async () => {
    await start();
    await renderRouter(routes, { initialUrl: '/paywall' });
    await fireEvent.press(await screen.findByTestId('plan-monthly'));
    expect(screen.getByTestId('plan-monthly')).toBeSelected();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
    // No trial on monthly: no timeline.
    expect(screen.queryByTestId('paywall-timeline')).toBeNull();
    expect(screen.getByTestId('paywall-price-line')).toHaveTextContent(
      '£9.99/month (£2.31/week), renews automatically. Cancel anytime.',
    );
  });

  it('shows the USD fallback while the store loads and does not allow buying', async () => {
    const svc = configureBilling({ api: mockApi(), store: (store = new FakeStore()) });
    store.connect.mockImplementation(() => new Promise(() => undefined)); // never connects
    void svc.init();
    await waitFor(() => expect(useBillingStore.getState().storeStatus).toBe('connecting'));
    await renderRouter(routes, { initialUrl: '/paywall' });
    expect(await screen.findByTestId('plan-yearly-price')).toHaveTextContent('$59.99');
    expect(screen.getByTestId('paywall-loading')).toBeTruthy();
    expect(screen.getByTestId('paywall-cta')).toBeDisabled();
  });

  it('store error shows a retry', async () => {
    store = new FakeStore();
    store.fetchSubscriptions.mockRejectedValueOnce(new Error('down'));
    const svc = configureBilling({ api: mockApi(), store });
    await act(async () => {
      await svc.init();
    });
    await renderRouter(routes, { initialUrl: '/paywall' });
    expect(await screen.findByTestId('paywall-store-error')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(useBillingStore.getState().productsStatus).toBe('ready'));
  });

  it('Terms and Privacy open the legal pages', async () => {
    await start();
    await renderRouter(routes, { initialUrl: '/paywall' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Terms' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Privacy' }));
    expect(openURL.mock.calls.map((c) => c[0])).toEqual([
      'https://repwise.app/terms',
      'https://repwise.app/privacy',
    ]);
  });

  it('buying unlocks Pro and closes the paywall', async () => {
    await start();
    store.next = () => storePurchase();
    await renderRouter(routes, { initialUrl: '/paywall' });
    await fireEvent.press(await screen.findByTestId('paywall-cta'));
    expect(store.finish).toHaveBeenCalled();
    expect(await screen.findByTestId('home')).toBeTruthy();
    expect(useBillingStore.getState().entitlement?.pro).toBe(true);
  });

  it('Restore is always there', async () => {
    await start();
    await renderRouter(routes, { initialUrl: '/paywall' });
    await fireEvent.press(await screen.findByRole('button', { name: 'Restore purchases' }));
    expect(store.getAvailablePurchases).toHaveBeenCalledWith({ sync: true });
    // Nothing to restore: said inline on the paywall (a toast would sit behind the iOS modal).
    expect(await screen.findByTestId('paywall-notice')).toHaveTextContent(
      'No active subscription found for this account.',
    );
    expect(screen.getByTestId('screen-paywall')).toBeTruthy();
  });

  it('cannot open while payments are off', async () => {
    await start({ enabled: false });
    await renderRouter(routes, { initialUrl: '/paywall' });
    expect(await screen.findByTestId('home')).toBeTruthy();
    expect(screen.queryByTestId('screen-paywall')).toBeNull();
  });
});

describe(`settings → subscription (${Platform.OS})`, () => {
  it('hidden while payments are off', async () => {
    await start({ enabled: false });
    await renderRouter(routes, { initialUrl: '/settings' });
    expect(await screen.findByTestId('screen-settings')).toBeTruthy();
    expect(screen.queryByTestId('open-subscription')).toBeNull();
  });

  it('shows plan, renewal and opens the store Manage page for this platform', async () => {
    await start({ ent: entitlement({ inTrial: false }) });
    await renderRouter(routes, { initialUrl: '/settings' });
    await fireEvent.press(await screen.findByTestId('open-subscription'));
    expect(await screen.findByTestId('screen-subscription')).toBeTruthy();
    expect(screen.getByTestId('subscription-plan')).toHaveTextContent('Repwise Pro · Yearly');
    expect(screen.getByTestId('subscription-renewal')).toHaveTextContent(/^Renews /);
    await fireEvent.press(screen.getByRole('button', { name: 'Manage or cancel' }));
    expect(openURL).toHaveBeenCalledWith(
      os() === 'ios'
        ? 'https://apps.apple.com/account/subscriptions'
        : 'https://play.google.com/store/account/subscriptions?sku=repwise_pro&package=com.client.repwise',
    );
    expect(screen.queryByTestId('subscription-other-store')).toBeNull();
  });

  it('a subscription from the other store says where to manage it', async () => {
    await start({ ent: entitlement({ source: os() === 'ios' ? 'play' : 'apple' }) });
    await renderRouter(routes, { initialUrl: '/settings/subscription' });
    expect(await screen.findByTestId('subscription-other-store')).toBeTruthy();
  });

  it('free users see plans and Restore', async () => {
    await start();
    await renderRouter(routes, { initialUrl: '/settings/subscription' });
    expect(await screen.findByText('Repwise Free')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Restore purchases' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'See plans' }));
    expect(await screen.findByTestId('screen-paywall')).toBeTruthy();
  });
});

describe('usePro', () => {
  function Probe({ now }: { now?: number }) {
    const p = usePro(now);
    return <Text testID="probe">{`${p.isPro}|${p.subscribed}|${p.paymentsEnabled}`}</Text>;
  }
  const probeRoutes = (now?: number) => ({ index: () => <Probe now={now} /> });

  it('flag off: everyone is Pro (nobody gated), nothing subscribed', async () => {
    await start({ enabled: false });
    await renderRouter(probeRoutes(), { initialUrl: '/' });
    expect(await screen.findByTestId('probe')).toHaveTextContent('true|false|false');
  });

  it('flag on: Pro only from the Worker entitlement', async () => {
    await start();
    await renderRouter(probeRoutes(), { initialUrl: '/' });
    expect(await screen.findByTestId('probe')).toHaveTextContent('false|false|true');
  });

  it('flag on + active entitlement → Pro; past expiry + grace → not Pro', async () => {
    const ent = entitlement();
    await start({ ent });
    await renderRouter(probeRoutes(), { initialUrl: '/' });
    expect(await screen.findByTestId('probe')).toHaveTextContent('true|true|true');
    await renderRouter(probeRoutes(ent.expiresAt! + 4 * 86_400_000), { initialUrl: '/' });
    expect(await screen.findByTestId('probe')).toHaveTextContent('false|false|true');
  });
});
