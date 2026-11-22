import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Platform, Text } from 'react-native';

import { initialBillingState, useBillingStore } from '@/services/billing';
import { haptics } from '@/services/haptics';
import {
  resetDemoPaymentsState,
  setDemoPaymentsOn,
  useDemoPayments,
} from '@/services/demoPayments';
import { kv } from '@/services/storage';
import { colors, useThemeStore } from '@/theme';

import { flat, renderThemed } from '../../../../test/render';
import {
  DEMO_PROCESSING_MS,
  DemoCheckout,
  maskedCard,
  planSummary,
  totalToday,
} from '../components/DemoCheckout';
import { closeGate, GateSheetHost, openGate, useGateSheet } from '../components/GateSheet';
import { usePro } from '../hooks/usePro';
import { PaywallScreen } from '../screens/PaywallScreen';
import { SubscriptionScreen } from '../screens/SubscriptionScreen';
import { SheetHost } from '@/ui/Sheet';

const routes = {
  index: () => <Text testID="home">home</Text>,
  paywall: PaywallScreen,
  'settings/subscription': SubscriptionScreen,
};

const YEARLY = {
  plan: 'yearly' as const,
  sku: 'y',
  price: '$59.99',
  amount: 59.99,
  currency: 'USD',
  trialDays: 7,
  perWeek: '$1.15',
  localised: true,
};

beforeEach(() => {
  [
    'billing.paymentsEnabled.v1',
    'billing.entitlement.v1',
    'billing.demo.on.v1',
    'billing.demo.entitlement.v1',
  ].forEach((k) => kv.remove(k));
  useBillingStore.setState(initialBillingState(), true);
  resetDemoPaymentsState();
  closeGate();
  useThemeStore.getState().setPreference('light');
});

afterEach(() => {
  jest.useRealTimers();
});

describe(`demo checkout pure bits (${Platform.OS})`, () => {
  it('total today is $0.00 during the trial, else the price', () => {
    expect(totalToday(YEARLY)).toBe('$0.00');
    expect(totalToday({ ...YEARLY, trialDays: 0 })).toBe('$59.99');
    expect(totalToday({ ...YEARLY, currency: 'GBP' })).toBe('0.00 GBP');
  });
  it('masks the card to the last 4', () => {
    expect(maskedCard('4444 4444 4444 4444')).toBe('•••• 4444');
    expect(maskedCard('12')).toBe('•••• ••12');
  });
  it('summarises the plan honestly', () => {
    expect(planSummary(YEARLY)).toBe('7-day free trial, then $59.99/year');
    expect(planSummary({ plan: 'weekly', trialDays: 0, price: '$4.99' })).toBe('$4.99 every week');
  });
});

describe(`demo purchase flow (${Platform.OS})`, () => {
  it.each(['light', 'dark'] as const)(
    'paywall → TEST checkout •••• 4444 → Payment complete → Pro (test) (%s)',
    async (scheme) => {
      useThemeStore.getState().setPreference(scheme);
      const success = jest.spyOn(haptics, 'success').mockImplementation(() => {});
      await act(async () => {
        setDemoPaymentsOn(true);
      });
      await renderRouter(routes, { initialUrl: '/paywall?source=gate:meal_swap' });
      expect(await screen.findByTestId('screen-paywall')).toBeTruthy();
      expect(screen.getByTestId('paywall-title')).toHaveTextContent('Swap any meal.');
      // All 4 plans with USD prices; yearly pre-selected; weekly visible.
      expect(screen.getByTestId('plan-weekly-price')).toHaveTextContent('$4.99');
      expect(screen.getByTestId('plan-monthly-price')).toHaveTextContent('$12.99');
      expect(screen.getByTestId('plan-quarterly-price')).toHaveTextContent('$24.99');
      expect(screen.getByTestId('plan-yearly-price')).toHaveTextContent('$59.99');
      expect(screen.getByRole('radio', { name: /^Yearly/ })).toBeSelected();
      expect(screen.getByTestId('paywall-cta')).toHaveTextContent('Start free trial');

      jest.useFakeTimers();
      await fireEvent.press(screen.getByTestId('paywall-cta'));
      expect(screen.getByTestId('demo-checkout')).toBeTruthy();
      expect(screen.getByTestId('demo-test-badge')).toHaveTextContent('TEST MODE');
      expect(screen.getByTestId('demo-card-masked')).toHaveTextContent('Card •••• 4444');
      expect(screen.getByTestId('demo-total')).toHaveTextContent('$0.00');
      expect(screen.getByTestId('demo-plan-summary')).toHaveTextContent(/Repwise Pro · Yearly/);

      await fireEvent.press(screen.getByTestId('demo-confirm'));
      expect(screen.getByTestId('demo-processing')).toBeTruthy();
      expect(useDemoPayments.getState().entitlement).toBeNull();
      await act(async () => {
        jest.advanceTimersByTime(DEMO_PROCESSING_MS);
      });
      expect(screen.getByTestId('demo-payment-complete')).toHaveTextContent(/Payment complete/);
      expect(success).toHaveBeenCalledTimes(1);
      jest.useRealTimers();

      await fireEvent.press(screen.getByTestId('demo-continue'));
      expect(useDemoPayments.getState().entitlement).toMatchObject({ demo: true, plan: 'yearly' });
      expect(await screen.findByTestId('home')).toBeTruthy();
      success.mockRestore();
    },
  );

  it('a paid plan charges the price today; cancel goes back to the paywall', async () => {
    await act(async () => {
      setDemoPaymentsOn(true);
    });
    await renderRouter(routes, { initialUrl: '/paywall' });
    await fireEvent.press(await screen.findByTestId('plan-weekly'));
    expect(screen.getByTestId('paywall-cta')).toHaveTextContent('Continue');
    await fireEvent.press(screen.getByTestId('paywall-cta'));
    expect(screen.getByTestId('demo-total')).toHaveTextContent('$4.99');
    await fireEvent.press(screen.getByTestId('demo-cancel'));
    expect(screen.queryByTestId('demo-checkout')).toBeNull();
    expect(screen.getByTestId('screen-paywall')).toBeTruthy();
    expect(useDemoPayments.getState().entitlement).toBeNull();
  });

  it('Settings → Subscription shows the test plan and can reset it', async () => {
    await act(async () => {
      setDemoPaymentsOn(true);
    });
    const { grantDemoEntitlement } =
      jest.requireActual<typeof import('@/services/demoPayments')>('@/services/demoPayments');
    await act(async () => {
      grantDemoEntitlement('yearly', 7);
    });
    await renderRouter(routes, { initialUrl: '/settings/subscription' });
    expect(await screen.findByTestId('subscription-plan')).toHaveTextContent(
      'Repwise Pro · Yearly (test)',
    );
    await fireEvent.press(screen.getByTestId('subscription-reset-test'));
    expect(useDemoPayments.getState().entitlement).toBeNull();
    expect(screen.getByTestId('subscription-plan')).toHaveTextContent('Repwise Free');
  });

  it('with demo payments off the store path is untouched (paywall redirects without payments)', async () => {
    await renderRouter(routes, { initialUrl: '/paywall' });
    expect(await screen.findByTestId('home')).toBeTruthy();
  });
});

function ProProbe() {
  const p = usePro();
  return <Text testID="probe">{`${p.isPro}|${p.paymentsEnabled}|${p.demo ? 'demo' : '-'}`}</Text>;
}

describe(`usePro with demo payments (${Platform.OS})`, () => {
  it('free → Pro (test) after the demo purchase', async () => {
    await renderThemed(<ProProbe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('true|false|-');
    await act(async () => {
      setDemoPaymentsOn(true);
    });
    expect(screen.getByTestId('probe')).toHaveTextContent('false|true|-');
    const { grantDemoEntitlement } =
      jest.requireActual<typeof import('@/services/demoPayments')>('@/services/demoPayments');
    await act(async () => {
      grantDemoEntitlement('yearly', 7);
    });
    expect(screen.getByTestId('probe')).toHaveTextContent('true|true|demo');
  });
});

describe(`gate sheet F-S5 (${Platform.OS})`, () => {
  it.each(['light', 'dark'] as const)(
    'names the benefit with a preview; Start free trial → paywall; Not now closes (%s)',
    async (scheme) => {
      useThemeStore.getState().setPreference(scheme);
      await act(async () => {
        setDemoPaymentsOn(true);
      });
      await renderRouter(
        {
          index: () => (
            <>
              <Text testID="home">home</Text>
              <GateSheetHost />
              <SheetHost />
            </>
          ),
          paywall: PaywallScreen,
        },
        { initialUrl: '/' },
      );
      await act(async () => {
        openGate('meal_swap');
      });
      expect(await screen.findByTestId('gate-title')).toHaveTextContent('Swap any meal');
      expect(screen.getByTestId('gate-preview')).toHaveTextContent(/Unlimited swaps/);
      expect(screen.getByTestId('gate-cta')).toHaveTextContent('Start free trial');
      expect(flat(screen.getByTestId('gate-preview').props.style).backgroundColor).toBe(
        colors[scheme].surface,
      );

      await fireEvent.press(screen.getByTestId('gate-not-now'));
      expect(useGateSheet.getState().feature).toBeNull();
      expect(screen.getByTestId('home')).toBeTruthy();

      await act(async () => {
        openGate('grocery');
      });
      await fireEvent.press(await screen.findByTestId('gate-cta'));
      expect(useGateSheet.getState().feature).toBeNull();
      expect(await screen.findByTestId('screen-paywall')).toBeTruthy();
      expect(screen.getByTestId('paywall-title')).toHaveTextContent('Your grocery list, done.');
    },
  );
});

describe(`production build (${Platform.OS})`, () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('the demo checkout cannot render when the flag is off', async () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    process.env.EXPO_PUBLIC_DEMO_PAYMENTS = '1';
    jest.isolateModules(() => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const { DemoCheckout: ProdCheckout } =
        require('../components/DemoCheckout') as typeof import('../components/DemoCheckout');
      /* eslint-enable @typescript-eslint/no-require-imports */
      // The component bails out before any hook: nothing is drawn, whatever the props.
      expect(ProdCheckout({ offer: YEARLY, onCancel: () => {}, onComplete: () => {} })).toBeNull();
    });
    // Sanity: in this (test) build it does render.
    expect(DemoCheckout).toBeDefined();
  });
});
