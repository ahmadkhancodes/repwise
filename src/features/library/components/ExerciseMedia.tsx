import type { Muscle } from '@repwise/content';
import { BlurMask, Canvas, Circle, Group } from '@shopify/react-native-skia';
import { Image } from 'expo-image';
import { RotateCcw } from 'lucide-react-native';
import { memo, useEffect, useMemo, useState } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { gifForMediaId } from '@/services/exerciseMedia';
import { useTheme } from '@/theme';
import { Badge, PressableScale, Text } from '@/ui';

import { resolveItem, useCatalogState, useCustomItems } from '../hooks/useLibrary';
import { bestView, type BodyView } from '../logic/bodyMap';
import { bodyPalette } from '../logic/bodyPalette';
import { EQUIPMENT_GLYPH, LEVEL_GLYPH } from '../logic/glyphs';
import { heroLabel, heroLayout, heroOverlay, type HeroExercise } from '../logic/hero';

import { BodyFigure, MuscleThumb, useMuscleMotion } from './BodyMap';

export type { HeroExercise } from '../logic/hero';

type MediaProps = {
  mediaId: string | null;
  name: string;
  testID?: string;
  /** Muscles, kit, pattern and level for the muscle-map hero (a content Exercise fits). */
  exercise?: HeroExercise | null;
};

/** Resolve an exercise id in the catalogue / own exercises (the workout player only has the id). */
function useResolvedExercise(exerciseId: string): HeroExercise | null {
  const { catalog } = useCatalogState();
  const { items } = useCustomItems();
  return resolveItem(exerciseId, catalog, items) ?? null;
}

const EMPTY: readonly Muscle[] = [];

// ---------------------------------------------------------------------------
// Thumbnail (lists, shelves)
// ---------------------------------------------------------------------------

export type ExerciseThumbProps = MediaProps & {
  /** Square size in px (default: list row 56). */
  size?: number;
};

/**
 * List thumbnail: a muscle-map crop zoomed onto the main muscles (always drawn, so the list never
 * shows grey tiles). When the exercise has an ExerciseDB demo, its first frame (still, no
 * autoplay: a list of moving GIFs is noise and battery) covers the map once loaded.
 */
export const ExerciseThumb = memo(function ExerciseThumb({
  mediaId,
  name,
  testID,
  exercise: meta,
  size: sizeProp,
}: ExerciseThumbProps) {
  const t = useTheme();
  const size = sizeProp ?? t.sizes.row;
  const gif = gifForMediaId(mediaId);
  // Keyed by URL, so a recycled row with another exercise retries instead of staying failed.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const failed = failedUri !== null && failedUri === gif;
  const primary = meta?.primaryMuscles ?? EMPTY;
  const secondary = meta?.secondaryMuscles ?? EMPTY;
  const view = useMemo(() => bestView(primary, secondary), [primary, secondary]);
  const box: ViewStyle = {
    width: size,
    height: size,
    borderRadius: t.radius.button,
    overflow: 'hidden',
    backgroundColor: t.colors.surface,
  };
  return (
    <View
      style={box}
      testID={testID}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <MuscleThumb primary={primary} secondary={secondary} view={view} size={size} />
      {gif && !failed ? (
        <Image
          testID={testID ? `${testID}-image` : undefined}
          source={gif}
          recyclingKey={mediaId ?? undefined}
          cachePolicy="memory-disk"
          contentFit="cover"
          autoplay={false}
          transition={0}
          accessibilityLabel={`${name} demo`}
          onError={() => setFailedUri(gif)}
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            backgroundColor: t.colors.mediaStage,
          }}
        />
      ) : null}
    </View>
  );
});

// ---------------------------------------------------------------------------
// Hero (exercise detail S19, workout player S14)
// ---------------------------------------------------------------------------

export type ExerciseHeroProps = MediaProps & {
  /** Alternative to `exercise`: look the exercise up in the catalogue / own exercises. */
  exerciseId?: string;
  /** Width / height (default 4:3). */
  aspectRatio?: number;
  /**
   * `demo` (default): the animated ExerciseDB GIF when there is one, else the muscle map.
   * `map`: always the muscle map ("Muscles worked" on the detail page).
   */
  variant?: 'demo' | 'map';
};

function HeroById(props: ExerciseHeroProps & { exerciseId: string }) {
  const meta = useResolvedExercise(props.exerciseId);
  return <Hero {...props} exercise={meta} />;
}

/**
 * Exercise hero. The main visual is the animated ExerciseDB demo (GIF from our CDN, memory-disk
 * cache, prefetched for today and tomorrow) on a light stage, with a small muscle inset in the
 * corner. Without a demo (no match, custom exercise) or when the GIF fails or is offline, it is a
 * designed muscle map at once: the side that shows the main muscles (auto-picked, tap to turn),
 * main muscles in the accent, secondary in a soft tint, with the kit glyph, pattern and level.
 * The map is also the placeholder while the GIF loads, so there is never a spinner.
 */
export function ExerciseHero(props: ExerciseHeroProps) {
  const { exercise, exerciseId } = props;
  return !exercise && exerciseId ? (
    <HeroById {...props} exerciseId={exerciseId} />
  ) : (
    <Hero {...props} />
  );
}

function Hero({
  mediaId,
  name,
  testID,
  exercise: meta,
  aspectRatio = 4 / 3,
  variant = 'demo',
}: ExerciseHeroProps) {
  const t = useTheme();
  const gif = variant === 'demo' ? gifForMediaId(mediaId) : null;
  // Keyed by URL: the player moving to the next exercise starts clean (map until its GIF is in).
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const [readyUri, setReadyUri] = useState<string | null>(null);
  const failed = gif !== null && failedUri === gif;
  const demoReady = gif !== null && readyUri === gif;
  const [width, setWidth] = useState(0);
  const primary = meta?.primaryMuscles ?? EMPTY;
  const secondary = meta?.secondaryMuscles ?? EMPTY;
  const auto = useMemo(() => bestView(primary, secondary), [primary, secondary]);
  const [picked, setPicked] = useState<BodyView | null>(null);
  const view = picked ?? auto;
  const showMedia = Boolean(gif) && !failed;
  const demo = showMedia && demoReady;

  return (
    <View
      testID={testID}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{
        width: '100%',
        aspectRatio,
        borderRadius: t.radius.card,
        overflow: 'hidden',
        backgroundColor: t.colors.surface,
      }}
    >
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={heroLabel(name, meta, view, demo)}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        testID={testID ? `${testID}-map` : undefined}
      >
        {width > 0 && !demo ? (
          <MuscleStage
            width={width}
            aspectRatio={aspectRatio}
            view={view}
            primary={primary}
            secondary={secondary}
          />
        ) : null}
      </View>
      {gif && showMedia ? (
        <DemoGif
          key={gif}
          uri={gif}
          name={name}
          onReady={() => setReadyUri(gif)}
          onError={() => setFailedUri(gif)}
          testID={testID ? `${testID}-gif` : undefined}
        />
      ) : null}
      {demo ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            right: t.spacing.sm,
            bottom: t.spacing.sm,
            borderRadius: t.radius.button,
            overflow: 'hidden',
            backgroundColor: t.colors.surface,
          }}
          testID={testID ? `${testID}-inset` : undefined}
        >
          <MuscleThumb
            primary={primary}
            secondary={secondary}
            view={view}
            size={t.sizes.hitGymLarge}
          />
        </View>
      ) : (
        <HeroOverlays
          meta={meta}
          view={view}
          width={width}
          aspectRatio={aspectRatio}
          onFlip={meta ? () => setPicked(view === 'front' ? 'back' : 'front') : undefined}
          testID={testID}
        />
      )}
    </View>
  );
}

/** The drawn stage: soft accent halo, then the figure, which turns (scaleX) when flipped. */
function MuscleStage({
  width,
  aspectRatio,
  view,
  primary,
  secondary,
}: {
  width: number;
  aspectRatio: number;
  view: BodyView;
  primary: readonly Muscle[];
  secondary: readonly Muscle[];
}) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const palette = useMemo(() => bodyPalette(t.colors, t.scheme, 'surface'), [t.colors, t.scheme]);
  const l = heroLayout(width, aspectRatio, t.spacing.md);
  const { glow, reveal } = useMuscleMotion(`${view}|${primary.join()}|${secondary.join()}`);
  const turn = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) return;
    turn.set(0.05);
    turn.set(withSpring(1, t.motion.spring));
  }, [view, reduceMotion, turn, t.motion.spring]);
  const transform = useDerivedValue(() => [
    { translateX: l.cx },
    { scaleX: turn.value },
    { translateX: -l.cx },
    { translateX: l.x },
    { translateY: l.y },
    { scale: l.scale },
  ]);
  const secondaryOpacity = useDerivedValue(() => reveal.value);
  return (
    <Canvas style={{ width: l.width, height: l.height }}>
      <Circle
        cx={l.cx}
        cy={l.cy}
        r={l.height * 0.36}
        color={palette.glow}
        opacity={t.scheme === 'dark' ? 0.14 : 0.09}
      >
        <BlurMask blur={l.height / 7} style="normal" />
      </Circle>
      <Group transform={transform}>
        <BodyFigure
          view={view}
          palette={palette}
          primary={primary}
          secondary={secondary}
          primaryOpacity={glow}
          secondaryOpacity={secondaryOpacity}
        />
      </Group>
    </Canvas>
  );
}

/** Difficulty (top-left), pattern + kit glyph (bottom-left), side label + turn button (right). */
function HeroOverlays({
  meta,
  view,
  width,
  aspectRatio,
  onFlip,
  testID,
}: {
  meta: HeroExercise | null | undefined;
  view: BodyView;
  width: number;
  aspectRatio: number;
  onFlip?: () => void;
  testID?: string;
}) {
  const t = useTheme();
  const o = heroOverlay(meta);
  const l = heroLayout(width, aspectRatio, t.spacing.md);
  const Glyph = o.equipmentKey ? EQUIPMENT_GLYPH[o.equipmentKey] : null;
  const LevelGlyph = meta?.level ? LEVEL_GLYPH[meta.level] : undefined;
  const pad = t.spacing.md;
  const textWidth = width > 0 ? l.textWidth : undefined;
  const glyphBox = t.spacing.xxxl;
  return (
    <>
      {o.level ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: pad, left: pad }}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          <Badge
            label={o.level}
            icon={LevelGlyph}
            tone="outline"
            testID={testID ? `${testID}-level` : undefined}
          />
        </View>
      ) : null}
      {o.pattern || o.equipment ? (
        <View
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={{
            position: 'absolute',
            left: pad,
            bottom: pad,
            maxWidth: textWidth,
            gap: t.spacing.xs,
          }}
        >
          {Glyph ? (
            <View
              testID={testID ? `${testID}-glyph` : undefined}
              style={{
                width: glyphBox,
                height: glyphBox,
                borderRadius: t.radius.pill,
                backgroundColor: t.colors.inverse,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Glyph
                size={t.sizes.iconMedium}
                color={t.colors.onInverse}
                strokeWidth={t.sizes.iconStroke}
              />
            </View>
          ) : null}
          {o.equipment ? (
            <Text variant="headline" numberOfLines={2}>
              {o.equipment}
            </Text>
          ) : null}
          {o.pattern ? (
            <Text variant="callout" color="textSecondary" numberOfLines={2}>
              {o.pattern}
            </Text>
          ) : null}
        </View>
      ) : null}
      {meta ? (
        <Text
          variant="caption"
          color="textSecondary"
          importantForAccessibility="no"
          accessibilityElementsHidden
          style={{ position: 'absolute', top: pad, right: pad }}
        >
          {view === 'front' ? 'Front' : 'Back'}
        </Text>
      ) : null}
      {onFlip ? (
        <PressableScale
          onPress={onFlip}
          feedback="selection"
          accessibilityRole="button"
          accessibilityLabel={view === 'front' ? 'Show back view' : 'Show front view'}
          testID={testID ? `${testID}-flip` : undefined}
          style={{
            position: 'absolute',
            right: t.spacing.xs,
            bottom: t.spacing.xs,
            width: t.sizes.touch,
            height: t.sizes.touch,
            borderRadius: t.radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              width: glyphBox - t.spacing.xxs,
              height: glyphBox - t.spacing.xxs,
              borderRadius: t.radius.pill,
              backgroundColor: t.colors.bg,
              borderWidth: t.sizes.hairline,
              borderColor: t.colors.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <RotateCcw
              size={t.sizes.iconSmall}
              color={t.colors.textPrimary}
              strokeWidth={t.sizes.iconStroke}
            />
          </View>
        </PressableScale>
      ) : null}
    </>
  );
}

/**
 * The animated demo on the light stage. It fades in over the muscle map once the first frame is
 * decoded (instant from the disk cache). Reduce Motion: the first frame, still.
 */
function DemoGif({
  uri,
  name,
  onReady,
  onError,
  testID,
}: {
  uri: string;
  name: string;
  onReady: () => void;
  onError: () => void;
  testID?: string;
}) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const [loaded, setLoaded] = useState(false);
  const fadeIn = useSharedValue(0);

  useEffect(() => {
    if (!loaded) return;
    // Reduced motion: shown at once (never left at opacity 0 waiting on an animation).
    fadeIn.set(reduceMotion ? 1 : withTiming(1, { duration: t.motion.duration.base }));
  }, [loaded, fadeIn, t.motion.duration.base, reduceMotion]);

  const style = useAnimatedStyle(() => ({ opacity: fadeIn.value }));
  const fill = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

  return (
    <Animated.View
      style={[fill, { backgroundColor: t.colors.mediaStage }, style]}
      pointerEvents="none"
      testID={testID}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Image
        testID={testID ? `${testID}-image` : undefined}
        source={uri}
        cachePolicy="memory-disk"
        contentFit="contain"
        autoplay={!reduceMotion}
        transition={0}
        accessibilityLabel={`${name} demonstration`}
        onLoad={() => {
          setLoaded(true);
          onReady();
        }}
        onError={onError}
        style={{ width: '100%', height: '100%' }}
      />
    </Animated.View>
  );
}
