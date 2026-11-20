import type { Muscle } from '@repwise/content';
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  Path,
  Skia,
  type SkPath,
} from '@shopify/react-native-skia';
import { memo, useEffect, useMemo, useState } from 'react';
import { View, type GestureResponderEvent } from 'react-native';
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

import { haptics } from '@/services/haptics';
import { useTheme } from '@/theme';
import { Text } from '@/ui';

import {
  BODY_OUTLINE,
  MUSCLE_SHAPES,
  VIEW_H,
  VIEW_W,
  focusBox,
  hitTest,
  muscleRole,
  type BodyView,
} from '../logic/bodyMap';
import {
  HEAT_FLOOR,
  bodyPalette,
  heatColor,
  type BodyBackdrop,
  type BodyPalette,
} from '../logic/bodyPalette';
import { MUSCLE_LABEL } from '../logic/labels';

/**
 * The one muscle map of the app (audit: two body maps diverged). Three faces on one geometry and
 * one palette:
 *  - `BodyMap`      exercise muscles, front and back (custom-exercise preview);
 *  - `BodyHeatmap`  W6 recovery heatmap, one side, tap a muscle (progress);
 *  - `BodyFigure`   the raw Skia figure, used by the exercise hero and list thumbnail.
 * Skia paths are parsed once per app run and shared by every canvas (lists stay cheap).
 */

const pathCache = new Map<string, SkPath>();
function sk(d: string): SkPath {
  let p = pathCache.get(d);
  if (!p) {
    p = Skia.Path.MakeFromSVGString(d) ?? Skia.Path.Make();
    pathCache.set(d, p);
  }
  return p;
}

type Regions = { muscle: Muscle; key: string; path: SkPath }[];
const regionCache = new Map<BodyView, Regions>();
function regionsOf(view: BodyView): Regions {
  let r = regionCache.get(view);
  if (!r) {
    r = (Object.entries(MUSCLE_SHAPES[view]) as [Muscle, { d: string }[]][]).flatMap(
      ([muscle, shapes]) => shapes.map((s, i) => ({ muscle, key: `${muscle}${i}`, path: sk(s.d) })),
    );
    regionCache.set(view, r);
  }
  return r;
}
let outlineCache: SkPath[] | null = null;
function outline(): SkPath[] {
  if (!outlineCache) outlineCache = BODY_OUTLINE.map(sk);
  return outlineCache;
}

/** Heat input: any per-muscle fatigue map (the engine heatmap fits). */
export type BodyHeat = Readonly<Partial<Record<Muscle, { fatigue: number }>>>;

type Opacity = number | SharedValue<number>;

export type BodyFigureProps = {
  view: BodyView;
  palette: BodyPalette;
  primary?: readonly Muscle[];
  secondary?: readonly Muscle[];
  /** Heatmap mode: fills every muscle by fatigue instead of primary/secondary. */
  heat?: BodyHeat;
  selected?: Muscle | null;
  /** Opacity of the main-muscle fill (animated breathing). */
  primaryOpacity?: Opacity;
  /** Opacity of the secondary tint (animated reveal). */
  secondaryOpacity?: Opacity;
  /** Stroke width of the selected outline in view units. */
  selectedStroke?: number;
};

/** Skia drawing of one side of the body in view units (0..VIEW_W × 0..VIEW_H). Place it in a Group. */
export const BodyFigure = memo(function BodyFigure({
  view,
  palette,
  primary = [],
  secondary = [],
  heat,
  selected,
  primaryOpacity = 1,
  secondaryOpacity = 1,
  selectedStroke = 1,
}: BodyFigureProps) {
  const regions = regionsOf(view);
  return (
    <Group>
      {outline().map((p, i) => (
        <Path key={`o${i}`} path={p} color={palette.figure} />
      ))}
      {regions.map((r) => {
        if (heat) {
          const f = heat[r.muscle]?.fatigue ?? 0;
          return (
            <Group key={r.key}>
              {f > 0.4 ? (
                <Path path={r.path} color={palette.primary} opacity={f * 0.6}>
                  <BlurMask blur={VIEW_W / 34} style="normal" />
                </Path>
              ) : null}
              <Path path={r.path} color={f > HEAT_FLOOR ? heatColor(palette, f) : palette.idle} />
            </Group>
          );
        }
        const role = muscleRole(r.muscle, primary, secondary);
        return (
          <Group key={r.key}>
            <Path path={r.path} color={palette.idle} />
            {role === 'primary' ? (
              <Path path={r.path} color={palette.primary} opacity={primaryOpacity} />
            ) : null}
            {role === 'secondary' ? (
              <Path path={r.path} color={palette.secondary} opacity={secondaryOpacity} />
            ) : null}
          </Group>
        );
      })}
      {selected
        ? regions
            .filter((r) => r.muscle === selected)
            .map((r) => (
              <Path
                key={`s${r.key}`}
                path={r.path}
                color={palette.selected}
                style="stroke"
                strokeWidth={selectedStroke}
              />
            ))
        : null}
    </Group>
  );
});

/** Breaths after the spring-in; then the canvas is still (no endless per-frame redraw). */
export const BREATHS = 3;

/** Main muscles spring in then breathe; the secondary tint fades in. Reduce Motion: final state. */
export function useMuscleMotion(key: string, enabled = true) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const still = reduceMotion || !enabled;
  const glow = useSharedValue(still ? 1 : 0);
  const reveal = useSharedValue(still ? 1 : 0);
  useEffect(() => {
    if (still) {
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
          BREATHS,
          false,
        ),
      ),
    );
    reveal.set(withDelay(t.motion.duration.fast, withSpring(1, t.motion.spring)));
  }, [key, still, glow, reveal, t.motion]);
  return { glow, reveal };
}

export type BodyMapProps = {
  primary: readonly Muscle[];
  secondary: readonly Muscle[];
  /** Max figure height in px (keeps the card compact on tall phones). */
  maxHeight?: number;
  /** What the map sits on (default: a surface card). */
  backdrop?: BodyBackdrop;
  /** Show the Main / Also works legend (default true). */
  legend?: boolean;
  testID?: string;
};

/**
 * Muscle map (S19, RW-28 preview): front and back figures drawn with Skia. Main muscles spring in
 * and breathe in the accent; secondary muscles fade in at a lighter tint.
 */
export function BodyMap({
  primary,
  secondary,
  maxHeight,
  backdrop = 'surface',
  legend = true,
  testID,
}: BodyMapProps) {
  const t = useTheme();
  const palette = useMemo(
    () => bodyPalette(t.colors, t.scheme, backdrop),
    [t.colors, t.scheme, backdrop],
  );
  const [width, setWidth] = useState(0);
  const { glow, reveal } = useMuscleMotion(`${primary.join()}|${secondary.join()}`);
  const secondaryOpacity = useDerivedValue(() => reveal.value);
  const gap = t.spacing.md;
  const cap = maxHeight ?? t.sizes.ringHero + t.spacing.xxxl;

  const figW = Math.max(0, (width - gap) / 2);
  const scale = Math.min(figW / VIEW_W, cap / VIEW_H);
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
            {(['front', 'back'] as const).map((view, i) => (
              <Group key={view} transform={[{ translateX: i * (figW + gap) + inset }, { scale }]}>
                <BodyFigure
                  view={view}
                  palette={palette}
                  primary={primary}
                  secondary={secondary}
                  primaryOpacity={glow}
                  secondaryOpacity={secondaryOpacity}
                />
              </Group>
            ))}
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
      {legend ? (
        <View
          style={{ gap: t.spacing.xs }}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          <MuscleLegend color={palette.primary} title="Main" muscles={primary} />
          {secondary.length ? (
            <MuscleLegend color={palette.secondary} title="Also works" muscles={secondary} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** "● Main: Chest, Triceps" — the dot uses the same colour as the map. */
export function MuscleLegend({
  color,
  title,
  muscles,
  testID,
}: {
  color: string;
  title: string;
  muscles: readonly Muscle[];
  testID?: string;
}) {
  const t = useTheme();
  const dot = t.spacing.sm;
  return (
    <View
      testID={testID}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.xs }}
    >
      <View
        style={{
          width: dot,
          height: dot,
          marginTop: (t.typography.callout.lineHeight - dot) / 2,
          borderRadius: t.radius.pill,
          backgroundColor: color,
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

export type BodyHeatmapProps = {
  heat: BodyHeat;
  view: BodyView;
  selected?: Muscle | null;
  onSelect?: (m: Muscle) => void;
  /** Rendered height (default: the hero ring size plus room); width follows the figure. */
  height?: number;
  /** Spoken summary, e.g. "Front muscle map. Chest recovering, …". */
  accessibilityLabel: string;
  testID?: string;
};

/**
 * W6 recovery heatmap: one side of the body whose muscles glow by recent work. The glow springs
 * in on every change of side or data; tap a muscle to select it (selection haptic on commit).
 */
export function BodyHeatmap({
  heat,
  view,
  selected,
  onSelect,
  height: heightProp,
  accessibilityLabel,
  testID,
}: BodyHeatmapProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const palette = useMemo(() => bodyPalette(t.colors, t.scheme, 'bg'), [t.colors, t.scheme]);
  const height = heightProp ?? t.sizes.ringHero + t.spacing.huge * 2 + t.spacing.lg;
  const scale = height / VIEW_H;
  const width = VIEW_W * scale;

  const glow = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    glow.set(0);
    glow.set(reduceMotion ? 1 : withSpring(1, t.motion.spring));
  }, [view, heat, reduceMotion, glow, t.motion.spring]);

  const onTouch = (e: GestureResponderEvent) => {
    const m = hitTest(view, e.nativeEvent.locationX / scale, e.nativeEvent.locationY / scale);
    if (m && onSelect) {
      haptics.selection();
      onSelect(m);
    }
  };

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      onStartShouldSetResponder={() => Boolean(onSelect)}
      onResponderRelease={onTouch}
      style={{ width, height, alignSelf: 'center' }}
    >
      <Canvas style={{ width, height }}>
        <Group transform={[{ scale }]}>
          <Group opacity={glow}>
            <BodyFigure
              view={view}
              palette={palette}
              heat={heat}
              selected={selected}
              selectedStroke={t.sizes.borderThick / scale}
            />
          </Group>
        </Group>
      </Canvas>
    </View>
  );
}

export type MuscleThumbProps = {
  primary: readonly Muscle[];
  secondary: readonly Muscle[];
  view: BodyView;
  size: number;
  backdrop?: BodyBackdrop;
};

/**
 * Static, cropped figure for list thumbnails: zooms onto the main muscles (focusBox) so a 56 dp
 * tile shows "chest" or "back" at a glance. No animation, cached paths: cheap in long lists.
 */
export const MuscleThumb = memo(function MuscleThumb({
  primary,
  secondary,
  view,
  size,
  backdrop = 'surface',
}: MuscleThumbProps) {
  const t = useTheme();
  const palette = useMemo(
    () => bodyPalette(t.colors, t.scheme, backdrop),
    [t.colors, t.scheme, backdrop],
  );
  const box = useMemo(() => focusBox(view, primary), [view, primary]);
  const scale = size / box.w;
  return (
    <Canvas style={{ width: size, height: size }}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={size * 0.42}
        color={palette.glow}
        opacity={t.scheme === 'dark' ? 0.16 : 0.1}
      >
        <BlurMask blur={size / 6} style="normal" />
      </Circle>
      <Group transform={[{ scale }, { translateX: -box.x }, { translateY: -box.y }]}>
        <BodyFigure view={view} palette={palette} primary={primary} secondary={secondary} />
      </Group>
    </Canvas>
  );
});
