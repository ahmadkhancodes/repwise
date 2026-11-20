import { View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

/**
 * Numbered step disc (UI audit P2-15): one inverse disc for recipe steps AND exercise steps,
 * glanceable mid-set or mid-stir. Decorative — the row speaks "Step N".
 */
export function StepNumber({ n, testID }: { n: number; testID?: string }) {
  const t = useTheme();
  const disc = t.spacing.xl;
  return (
    <View
      testID={testID}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{
        width: disc,
        height: disc,
        borderRadius: t.radius.pill,
        backgroundColor: t.colors.inverse,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text variant="caption" color="onInverse" tabular maxFontSizeMultiplier={1.2}>
        {n}
      </Text>
    </View>
  );
}
