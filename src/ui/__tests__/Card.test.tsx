import { fireEvent, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { colors, radius } from '@/theme';

import { flat, renderThemed, SCHEMES } from '../../../test/render';
import { Card } from '../Card';
import { Text } from '../Text';

describe.each(SCHEMES)('Card (%s)', (scheme) => {
  it('static card is a flat surface', async () => {
    await renderThemed(
      <Card testID="c">
        <Text>Leg day</Text>
      </Card>,
      scheme,
    );
    const style = flat(screen.getByTestId('c').props.style);
    expect(style.backgroundColor).toBe(colors[scheme].surface);
    expect(style.borderRadius).toBe(radius.card);
    expect(style.shadowOpacity).toBeUndefined();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('pressable card is one labelled button with a 48dp target', async () => {
    const onPress = jest.fn();
    await renderThemed(
      <Card onPress={onPress} accessibilityLabel="Open leg day">
        <Text>Leg day</Text>
      </Card>,
      scheme,
    );
    const btn = screen.getByRole('button', { name: 'Open leg day' });
    expect(flat(btn.props.style).minHeight).toBeGreaterThanOrEqual(48);
    await fireEvent.press(btn);
    expect(onPress).toHaveBeenCalled();
    if (Platform.OS === 'android') expect(btn.props.nativeBackgroundAndroid).toBeDefined();
    else expect(btn.props.nativeBackgroundAndroid).toBeUndefined();
  });

  it('selected state uses accentSoft and reports selected', async () => {
    await renderThemed(
      <Card onPress={() => undefined} selected accessibilityLabel="Plan A">
        <Text>Plan A</Text>
      </Card>,
      scheme,
    );
    const btn = screen.getByRole('button', { name: 'Plan A' });
    expect(btn).toBeSelected();
    expect(flat(btn.props.style).backgroundColor).toBe(colors[scheme].accentSoft);
  });
});
