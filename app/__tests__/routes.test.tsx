import { fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { useBillingStore } from '@/services/billing';

/* eslint-disable @typescript-eslint/no-require-imports */
const routes = {
  _layout: require('../_layout').default,
  index: require('../index').default,
  '(tabs)/_layout': require('../(tabs)/_layout').default,
  '(tabs)/today': require('../(tabs)/today').default,
  '(tabs)/train': require('../(tabs)/train').default,
  '(tabs)/eat': require('../(tabs)/eat').default,
  '(tabs)/progress': require('../(tabs)/progress').default,
  '(tabs)/library': require('../(tabs)/library').default,
  paywall: require('../paywall').default,
  'settings/_layout': require('../settings/_layout').default,
  'settings/index': require('../settings/index').default,
  'settings/subscription': require('../settings/subscription').default,
  'dev/ui': require('../dev/ui').default,
};
/* eslint-enable @typescript-eslint/no-require-imports */

jest.mock('@expo-google-fonts/inter', () => ({
  useFonts: () => [true, null],
  Inter_400Regular: 1,
  Inter_500Medium: 2,
  Inter_600SemiBold: 3,
  Inter_700Bold: 4,
}));

describe('app shell routes', () => {
  it('opens on Today with five tabs', async () => {
    await renderRouter(routes, { initialUrl: '/' });
    expect(await screen.findByTestId('screen-today')).toBeTruthy();
    for (const tab of ['today', 'train', 'eat', 'progress', 'library']) {
      expect(screen.getByTestId(`tab-${tab}`)).toBeTruthy();
    }
  });

  it.each(['train', 'eat', 'progress', 'library'])(
    'tab %s renders its placeholder',
    async (tab) => {
      await renderRouter(routes, { initialUrl: `/${tab}` });
      expect(await screen.findByTestId(`screen-${tab}`)).toBeTruthy();
    },
  );

  it('paywall modal has a close button, plans and the price line', async () => {
    useBillingStore.setState({ paymentsEnabled: true });
    await renderRouter(routes, { initialUrl: '/paywall' });
    expect(await screen.findByTestId('screen-paywall')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    expect(
      screen.getByText('7 days free, then $59.99/year ($1.15/week). Cancel anytime.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Yearly/ })).toBeSelected();
    useBillingStore.setState({ paymentsEnabled: false });
  });

  it('paywall cannot open while payments are off', async () => {
    useBillingStore.setState({ paymentsEnabled: false });
    await renderRouter(routes, { initialUrl: '/paywall' });
    expect(await screen.findByTestId('screen-today')).toBeTruthy();
  });

  it('settings theme override switches the scheme', async () => {
    await renderRouter(routes, { initialUrl: '/settings' });
    expect(await screen.findByTestId('screen-settings')).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Dark' }));
    expect(screen.getByRole('tab', { name: 'Dark' })).toBeSelected();
    await fireEvent.press(screen.getByRole('tab', { name: 'System' }));
  });

  it('hidden /dev/ui gallery renders in dev', async () => {
    await renderRouter(routes, { initialUrl: '/dev/ui' });
    expect(await screen.findByTestId('screen-dev-ui')).toBeTruthy();
    expect(screen.getAllByText('LIGHT').length).toBeGreaterThan(0);
    expect(screen.getAllByText('DARK').length).toBeGreaterThan(0);
  });
});
