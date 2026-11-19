import { screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

jest.mock('@expo-google-fonts/inter', () => ({
  useFonts: () => [true, null],
  Inter_400Regular: 1,
  Inter_500Medium: 2,
  Inter_600SemiBold: 3,
  Inter_700Bold: 4,
}));
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));

/* eslint-disable @typescript-eslint/no-require-imports */
const routes = {
  _layout: require('../../../../app/_layout').default,
  '(tabs)/_layout': require('../../../../app/(tabs)/_layout').default,
  '(tabs)/eat': require('../../../../app/(tabs)/eat').default,
  'meal/targets': require('../../../../app/meal/targets').default,
  'meal/log': require('../../../../app/meal/log').default,
  'meal/water': require('../../../../app/meal/water').default,
  'meal/day/[date]': require('../../../../app/meal/day/[date]').default,
  'recipe/[id]': require('../../../../app/recipe/[id]').default,
  'recipe/cook/[id]': require('../../../../app/recipe/cook/[id]').default,
  'grocery/index': require('../../../../app/grocery/index').default,
};
/* eslint-enable @typescript-eslint/no-require-imports */

describe('meals routes (deep links)', () => {
  it.each([
    ['/eat', 'screen-eat'],
    ['/meal/targets', 'screen-targets'],
    ['/meal/log?date=2026-11-19', 'screen-log'],
    ['/meal/water', 'screen-water'],
    ['/meal/day/2026-11-19', 'screen-day-log'],
    ['/recipe/chicken-karahi', 'screen-recipe'],
    ['/recipe/cook/chicken-karahi', 'screen-cook'],
    ['/grocery', 'screen-grocery'],
  ])('%s renders %s', async (url, id) => {
    await renderRouter(routes, { initialUrl: url });
    expect(await screen.findByTestId(id)).toBeTruthy();
  });
});
