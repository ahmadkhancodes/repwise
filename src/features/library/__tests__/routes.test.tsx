import { fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

/* eslint-disable @typescript-eslint/no-require-imports */
const routes = {
  _layout: require('../../../../app/_layout').default,
  index: require('../../../../app/index').default,
  '(tabs)/_layout': require('../../../../app/(tabs)/_layout').default,
  '(tabs)/today': require('../../../../app/(tabs)/today').default,
  '(tabs)/library': require('../../../../app/(tabs)/library').default,
  'exercise/[id]': require('../../../../app/exercise/[id]').default,
  'exercise/custom': require('../../../../app/exercise/custom').default,
};
/* eslint-enable @typescript-eslint/no-require-imports */

jest.mock('@expo-google-fonts/inter', () => ({
  useFonts: () => [true, null],
  Inter_400Regular: 1,
  Inter_500Medium: 2,
  Inter_600SemiBold: 3,
  Inter_700Bold: 4,
}));

describe('library routes', () => {
  it('library → exercise detail → back', async () => {
    await renderRouter(routes, { initialUrl: '/library' });
    await fireEvent.changeText(await screen.findByTestId('library-search'), 'push-up');
    await fireEvent.press(await screen.findByTestId('exercise-row-push-up'));
    expect(await screen.findByTestId('screen-exercise')).toBeTruthy();
    expect(screen.getByTestId('screen-exercise-title').props.children).toBe('Push-up');
    await fireEvent.press(screen.getByTestId('exercise-back'));
    expect(await screen.findByTestId('screen-library')).toBeTruthy();
  });

  it('deep links to /exercise/<id> and /exercise/custom', async () => {
    await renderRouter(routes, { initialUrl: '/exercise/barbell-back-squat' });
    expect(await screen.findByText('Barbell back squat')).toBeTruthy();
    await renderRouter(routes, { initialUrl: '/exercise/custom' });
    expect(await screen.findByText('New exercise')).toBeTruthy();
  });
});
