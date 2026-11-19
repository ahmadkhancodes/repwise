import { useEffect } from 'react';
import { Platform, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme, type ColorToken } from '@/theme';

import { Text } from './Text';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/**
 * Formats a number with thousands separators and fixed decimals. Runs on the
 * UI thread (no Intl there), so it is a plain worklet. Pure + unit-tested.
 */
export function formatNumber(value: number, decimals = 0): string {
  'worklet';
  const factor = 10 ** decimals;
  const rounded = Math.round(Math.abs(value) * factor) / factor;
  const [int = '0', frac] = rounded.toFixed(decimals).split('.');
  let grouped = '';
  for (let i = 0; i < int.length; i++) {
    const fromEnd = int.length - i;
    grouped += int[i];
    if (fromEnd > 1 && fromEnd % 3 === 1) grouped += ',';
  }
  const sign = value < 0 && rounded !== 0 ? '-' : '';
  return frac ? `${sign}${grouped}.${frac}` : `${sign}${grouped}`;
}

export type BigNumberProps = {
  value: number;
  /** e.g. "kg", "kcal". */
  unit?: string;
  /** Caption above the number, e.g. "Volume". */
  label?: string;
  decimals?: number;
  color?: ColorToken;
  /** Count up from the previous value (default true; off when Reduce Motion is on). */
  animate?: boolean;
  testID?: string;
};

/** Hero number (display 40/44, tabular) that counts to its value on the UI thread. */
export function BigNumber({
  value,
  unit,
  label,
  decimals = 0,
  color = 'textPrimary',
  animate = true,
  testID,
}: BigNumberProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const shown = useSharedValue(animate && !reduceMotion ? 0 : value);

  useEffect(() => {
    shown.set(
      animate && !reduceMotion
        ? withTiming(value, {
            duration: t.motion.duration.slow * 3,
            easing: Easing.out(Easing.cubic),
          })
        : value,
    );
  }, [value, animate, reduceMotion, shown, t.motion.duration.slow]);

  const animatedProps = useAnimatedProps(() => {
    const text = formatNumber(shown.value, decimals);
    return { text, defaultValue: text } as object;
  });

  const final = formatNumber(value, decimals);
  const type = t.typography.display;
  const spoken = [label, unit ? `${final} ${unit}` : final].filter(Boolean).join(', ');

  return (
    <View testID={testID} accessible accessibilityRole="text" accessibilityLabel={spoken}>
      {label ? (
        <Text variant="caption" color="textSecondary">
          {label}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: t.spacing.xxs }}>
        <AnimatedTextInput
          testID={testID ? `${testID}-value` : undefined}
          editable={false}
          caretHidden
          underlineColorAndroid="transparent"
          importantForAccessibility="no"
          defaultValue={final}
          animatedProps={animatedProps}
          maxFontSizeMultiplier={type.maxFontSizeMultiplier}
          style={[
            {
              fontFamily: type.fontFamily,
              fontSize: type.fontSize,
              lineHeight: type.lineHeight,
              color: t.colors[color],
              fontVariant: ['tabular-nums'],
              padding: 0,
              margin: 0,
            },
            Platform.OS === 'android' && { includeFontPadding: false, textAlignVertical: 'center' },
          ]}
        />
        {unit ? (
          <Text variant="headline" color="textSecondary">
            {unit}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
