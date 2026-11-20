import { fireEvent, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { Play } from 'lucide-react-native';
import { Platform } from 'react-native';

import { colors, fonts, spacing } from '@/theme';

import { flat, renderThemed, SCHEMES } from '../../../test/render';
import { Button, buttonPalette, type ButtonVariant } from '../Button';

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'tertiary', 'destructive'];

describe.each(SCHEMES)('Button (%s)', (scheme) => {
  beforeEach(() => jest.clearAllMocks());

  it.each(VARIANTS)('renders %s with its label, role and token colours', async (variant) => {
    await renderThemed(<Button label="Save" variant={variant} />, scheme);
    const btn = screen.getByRole('button', { name: 'Save' });
    const style = flat(btn.props.style);
    const p = buttonPalette(variant, false);
    expect(style.backgroundColor).toBe(p.bg ? colors[scheme][p.bg] : 'transparent');
    expect(style.minHeight).toBeGreaterThanOrEqual(48);
    expect(style.height).toBeUndefined(); // grows with font scale
  });

  it('accent primary uses the accent fill', async () => {
    await renderThemed(<Button label="Start workout" accent icon={Play} />, scheme);
    const style = flat(screen.getByRole('button').props.style);
    expect(style.backgroundColor).toBe(colors[scheme].accent);
  });

  it('fires onPress and a light haptic', async () => {
    const onPress = jest.fn();
    await renderThemed(<Button label="Go" onPress={onPress} />, scheme);
    const btn = screen.getByRole('button', { name: 'Go' });
    await fireEvent(btn, 'pressIn');
    await fireEvent.press(btn);
    expect(onPress).toHaveBeenCalledTimes(1);
    if (Platform.OS === 'android') expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalled();
    else expect(Haptics.impactAsync).toHaveBeenCalled();
  });

  it('is disabled and busy while loading', async () => {
    const onPress = jest.fn();
    await renderThemed(<Button label="Pay" loading onPress={onPress} testID="pay" />, scheme);
    const btn = screen.getByRole('button', { name: 'Pay' });
    expect(btn).toBeDisabled();
    expect(btn).toBeBusy();
    expect(screen.getByTestId('pay-spinner')).toBeTruthy();
    await fireEvent.press(btn);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('disabled state', async () => {
    await renderThemed(<Button label="Next" disabled />, scheme);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('press feedback: ripple on Android, spring scale on iOS', async () => {
    await renderThemed(<Button label="Tap" />, scheme);
    const btn = screen.getByRole('button', { name: 'Tap' });
    // Pressable turns android_ripple into a native background on the host view.
    if (Platform.OS === 'android') {
      expect(btn.props.nativeBackgroundAndroid).toMatchObject({
        type: 'RippleAndroid',
        borderless: false,
      });
    } else {
      expect(btn.props.nativeBackgroundAndroid).toBeUndefined();
    }
  });

  it('labels are bold (sheet 11) and wrap freely by default', async () => {
    await renderThemed(<Button label="Save" testID="b" />, scheme);
    const label = screen.getByTestId('b-label');
    expect(flat(label.props.style).fontFamily).toBe(fonts.bold);
    expect(label.props.numberOfLines).toBeUndefined();
  });

  it('caption: a one-line label with the detail underneath, both spoken', async () => {
    await renderThemed(
      <Button label="Log set 2" caption="102.5 kg × 10" accent testID="log" />,
      scheme,
    );
    expect(screen.getByRole('button', { name: 'Log set 2, 102.5 kg × 10' })).toBeTruthy();
    expect(screen.getByTestId('log-label').props.numberOfLines).toBe(1);
    expect(screen.getByTestId('log-caption')).toHaveTextContent('102.5 kg × 10');
  });

  it('compact: tight padding and a label that never wraps', async () => {
    await renderThemed(<Button label="Skip" compact testID="c" />, scheme);
    expect(flat(screen.getByRole('button').props.style).paddingHorizontal).toBe(spacing.sm);
    expect(screen.getByTestId('c-label').props.numberOfLines).toBe(1);
  });
});
