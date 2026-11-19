import { fireEvent, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { renderThemed, SCHEMES } from '../../../test/render';
import { PressableScale } from '../PressableScale';
import { Text } from '../Text';

const anyHaptic = () =>
  [
    Haptics.impactAsync,
    Haptics.selectionAsync,
    Haptics.notificationAsync,
    Haptics.performAndroidHapticsAsync,
  ].some((fn) => jest.mocked(fn).mock.calls.length > 0);

describe.each(SCHEMES)('PressableScale haptics (%s)', (scheme) => {
  beforeEach(() => jest.clearAllMocks());

  it('never buzzes on press-in (a scroll that starts on a card is silent)', async () => {
    await renderThemed(
      <PressableScale accessibilityRole="button" accessibilityLabel="Card" onPress={jest.fn()}>
        <Text>Card</Text>
      </PressableScale>,
      scheme,
    );
    const card = screen.getByRole('button', { name: 'Card' });
    await fireEvent(card, 'pressIn');
    await fireEvent(card, 'pressOut');
    expect(anyHaptic()).toBe(false);
  });

  it('buzzes once on commit (press or long-press)', async () => {
    const onLongPress = jest.fn();
    await renderThemed(
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Meal"
        feedback="success"
        onPress={jest.fn()}
        onLongPress={onLongPress}
      >
        <Text>Meal</Text>
      </PressableScale>,
      scheme,
    );
    const el = screen.getByRole('button', { name: 'Meal' });
    await fireEvent.press(el);
    if (Platform.OS === 'android')
      expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledWith('confirm');
    else expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
    await fireEvent(el, 'longPress');
    expect(onLongPress).toHaveBeenCalled();
  });

  it('no handler, no haptic', async () => {
    await renderThemed(
      <PressableScale accessibilityLabel="Static" testID="st">
        <Text>Static</Text>
      </PressableScale>,
      scheme,
    );
    await fireEvent.press(screen.getByTestId('st'));
    expect(anyHaptic()).toBe(false);
  });
});
