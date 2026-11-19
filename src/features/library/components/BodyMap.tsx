import type { Muscle } from '@repwise/content';
import { Canvas, Group, Path } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { Text } from '@/ui';

import {
  BODY_OUTLINE,
  MUSCLE_REGIONS,
  VIEW_H,
  VIEW_W,
  muscleRole,
  type BodyView,
} from '../logic/bodyMap';
import { MUSCLE_LABEL } from '../logic/labels';

export type BodyMapProps = {
  primary: readonly Muscle[];
  secondary: readonly Muscle[];
  /** Max figure height in px (keeps the card compact on tall phones). */
  maxHeight?: number;
  testID?: string;
};

const SECONDARY_ALPHA = 0.38;
const GAP = 16;

function Figure({
  view,
  primary,
  secondary,
  scale,
  dx,
  glow,
  reveal,
}: {
  view: BodyView;
  primary: readonly Muscle[];
  secondary: readonly Muscle[];
  scale: number;
  dx: number;
  glow: SharedValue<number>;
  reveal: SharedValue<number>;
}) {
  const t = useTheme();
  const secondaryOpacity = useDerivedValue(() => reveal.value * SECONDARY_ALPHA);
  const regions = Object.entries(MUSCLE_REGIONS[view]) as [Muscle, string[]][];
  return (
    <Group transform={[{ translateX: dx }, { scale }]}>
      {BODY_OUTLINE.map((d, i) => (
        <Path key={`o${i}`} path={d} color={t.colors.surface} />
      ))}
      {regions.map(([m, paths]) => {
        const role = muscleRole(m, primary, secondary);
        return paths.map((d, i) => (
          <Group key={`${m}${i}`}>
            <Path path={d} color={t.colors.surface2} />
            {role === 'primary' ? <Path path={d} color={t.colors.accent} opacity={glow} /> : null}
            {role === 'secondary' ? (
              <Path path={d} color={t.colors.accent} opacity={secondaryOpacity} />
            ) : null}
          </Group>
        ));
      })}
    </Group>
  );
}

/**
 * Muscle map (S19 wow moment): front and back figures drawn with Skia. Main muscles spring in and
 * then breathe softly in the accent colour; secondary muscles fade in at a lighter tint.
 * Reduce Motion shows the final state without animation.
 */
export function BodyMap({ primary, secondary, maxHeight = 280, testID }: BodyMapProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const glow = useSharedValue(reduceMotion ? 1 : 0);
  const reveal = useSharedValue(reduceMotion ? 1 : 0);
  const key = `${primary.join()}|${secondary.join()}`;

  useEffect(() => {
    if (reduceMotion) {
      glow.set(1);
      reveal.set(1);
      return;
    }
    glow.set(0);
    reveal.set(0);
    glow.set(
      withSequence(
        withSpring(1, t.motion.spring),
        withRepeat(
          withSequence(
            withTiming(0.72, { duration: t.motion.duration.slow * 4 }),
            withTiming(1, { duration: t.motion.duration.slow * 4 }),
          ),
          -1,
          false,
        ),
      ),
    );
    reveal.set(withDelay(t.motion.duration.fast, withSpring(1, t.motion.spring)));
  }, [key, reduceMotion, glow, reveal, t.motion]);

  const figW = Math.max(0, (width - GAP) / 2);
  const scale = Math.min(figW / VIEW_W, maxHeight / VIEW_H);
  const height = VIEW_H * scale;
  const inset = (figW - VIEW_W * scale) / 2;

  const label =
    `Muscles worked. Main: ${primary.map((m) => MUSCLE_LABEL[m]).join(', ') || 'none'}.` +
    (secondary.length ? ` Also: ${secondary.map((m) => MUSCLE_LABEL[m]).join(', ')}.` : '');

  return (
    <View testID={testID} style={{ gap: t.spacing.md }}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ width: '100%', minHeight: height }}
      >
        {width > 0 ? (
          <Canvas style={{ width, height }}>
            <Figure
              view="front"
              primary={primary}
              secondary={secondary}
              scale={scale}
              dx={inset}
              glow={glow}
              reveal={reveal}
            />
            <Figure
              view="back"
              primary={primary}
              secondary={secondary}
              scale={scale}
              dx={figW + GAP + inset}
              glow={glow}
              reveal={reveal}
            />
          </Canvas>
        ) : null}
        <View
          style={{ flexDirection: 'row', marginTop: t.spacing.xs }}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          <Text variant="caption" color="textSecondary" align="center" style={{ flex: 1 }}>
            Front
          </Text>
          <Text variant="caption" color="textSecondary" align="center" style={{ flex: 1 }}>
            Back
          </Text>
        </View>
      </View>
      <View
        style={{ gap: t.spacing.xs }}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <Legend tone="primary" title="Main" muscles={primary} />
        {secondary.length ? (
          <Legend tone="secondary" title="Also works" muscles={secondary} />
        ) : null}
      </View>
    </View>
  );
}

function Legend({
  tone,
  title,
  muscles,
}: {
  tone: 'primary' | 'secondary';
  title: string;
  muscles: readonly Muscle[];
}) {
  const t = useTheme();
  const dot = t.spacing.sm;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.xs }}>
      <View
        style={{
          width: dot,
          height: dot,
          marginTop: (t.typography.callout.lineHeight - dot) / 2,
          borderRadius: t.radius.pill,
          backgroundColor: t.colors.accent,
          opacity: tone === 'primary' ? 1 : SECONDARY_ALPHA,
        }}
      />
      <Text variant="callout" style={{ flex: 1 }}>
        <Text variant="callout">{title}: </Text>
        <Text variant="callout" color="textSecondary">
          {muscles.map((m) => MUSCLE_LABEL[m]).join(', ')}
        </Text>
      </Text>
    </View>
  );
}
