import { screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { colors, typography, type TypeVariant } from '@/theme';

import { flat, renderThemed, SCHEMES } from '../../../test/render';
import { Text } from '../Text';

describe.each(SCHEMES)('Text (%s)', (scheme) => {
  it.each(Object.keys(typography) as TypeVariant[])(
    'variant %s uses the type tokens',
    async (variant) => {
      await renderThemed(<Text variant={variant}>Hello</Text>, scheme);
      const el = screen.getByText('Hello');
      const style = flat(el.props.style);
      expect(style.fontSize).toBe(typography[variant].fontSize);
      expect(style.fontFamily).toBe(typography[variant].fontFamily);
      expect(style.fontWeight).toBeUndefined(); // custom fonts + fontWeight break on Android
      expect(el.props.maxFontSizeMultiplier).toBe(typography[variant].maxFontSizeMultiplier);
    },
  );

  it('applies colour tokens and tabular figures', async () => {
    await renderThemed(
      <Text color="textSecondary" tabular>
        12,450
      </Text>,
      scheme,
    );
    const style = flat(screen.getByText('12,450').props.style);
    expect(style.color).toBe(colors[scheme].textSecondary);
    expect(style.fontVariant).toEqual(['tabular-nums']);
  });

  it('strips Android font padding only on Android', async () => {
    await renderThemed(<Text>Pad</Text>, scheme);
    const style = flat(screen.getByText('Pad').props.style);
    if (Platform.OS === 'android') expect(style.includeFontPadding).toBe(false);
    else expect(style.includeFontPadding).toBeUndefined();
  });

  it('body text scales freely (no font-scale cap)', async () => {
    await renderThemed(<Text>Body</Text>, scheme);
    expect(screen.getByText('Body').props.maxFontSizeMultiplier).toBeUndefined();
  });
});
