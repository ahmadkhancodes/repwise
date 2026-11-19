import { BlurMask, Canvas, Group, Path, Skia } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { View, type GestureResponderEvent } from 'react-native';
import { useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { haptics } from '@/services/haptics';
import { useTheme } from '@/theme';

import { BODY_VIEWBOX, bodyRegions, hitTest, silhouette, type BodyView } from '../logic/bodyShapes';
import { mixColor } from '../logic/color';
import type { Heatmap, Muscle } from '../logic/engine';
import { muscleLabel, recoveryLabel } from '../logic/muscles';

const svg = (d: string) => Skia.Path.MakeFromSVGString(d) ?? Skia.Path.Make();

export type BodyMapProps = {
  heatmap: Heatmap;
  view: BodyView;
  selected?: Muscle | null;
  onSelect?: (m: Muscle) => void;
  /** Rendered height; width follows the 1:2 viewBox. */
  height?: number;
  testID?: string;
};

/**
 * W6 body heatmap: a calm front/back figure whose muscles glow green by recent work (engine
 * fatigue). Fresh muscles stay neutral. The glow fades in with the shared spring; tap a muscle
 * to select it (an accessible muscle list sits next to it on the screen).
 */
export function BodyMap({ heatmap, view, selected, onSelect, height = 360, testID }: BodyMapProps) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const scale = height / BODY_VIEWBOX.height;
  const width = BODY_VIEWBOX.width * scale;
  const regions = useMemo(() => bodyRegions(view), [view]);
  const base = useMemo(() => silhouette().map(svg), []);
  const paths = useMemo(() => regions.map((r) => svg(r.d)), [regions]);

  const glow = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    glow.set(0);
    glow.set(reduceMotion ? 1 : withSpring(1, t.motion.spring));
  }, [view, heatmap, reduceMotion, glow, t.motion.spring]);

  const onTouch = (e: GestureResponderEvent) => {
    const m = hitTest(view, e.nativeEvent.locationX / scale, e.nativeEvent.locationY / scale);
    if (m && onSelect) {
      haptics.selection();
      onSelect(m);
    }
  };

  const worked = regions.filter((r) => heatmap[r.muscle].fatigue > 0.05);
  const summary = [...new Set(worked.map((r) => r.muscle))]
    .map((m) => `${muscleLabel(m)} ${recoveryLabel(heatmap[m].recovery).toLowerCase()}`)
    .join(', ');

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${view === 'front' ? 'Front' : 'Back'} muscle map. ${summary || 'All muscles fresh.'}`}
      onStartShouldSetResponder={() => Boolean(onSelect)}
      onResponderRelease={onTouch}
      style={{ width, height, alignSelf: 'center' }}
    >
      <Canvas style={{ width, height }}>
        <Group transform={[{ scale }]}>
          {base.map((p, i) => (
            <Path key={`b${i}`} path={p} color={t.colors.surface2} />
          ))}
          {regions.map((r, i) => (
            <Path key={r.key} path={paths[i]!} color={t.colors.surface2} />
          ))}
          <Group opacity={glow}>
            {regions.map((r, i) => {
              const f = heatmap[r.muscle].fatigue;
              if (f <= 0.05) return null;
              return (
                <Group key={`g${r.key}`}>
                  {f > 0.4 ? (
                    <Path path={paths[i]!} color={t.colors.accent} opacity={f * 0.6}>
                      <BlurMask blur={6} style="normal" />
                    </Path>
                  ) : null}
                  <Path
                    path={paths[i]!}
                    color={mixColor(t.colors.surface2, t.colors.accent, 0.25 + f * 0.75)}
                  />
                </Group>
              );
            })}
          </Group>
          {regions.map((r, i) =>
            r.muscle === selected ? (
              <Path
                key={`s${r.key}`}
                path={paths[i]!}
                color={t.colors.textPrimary}
                style="stroke"
                strokeWidth={2 / scale}
              />
            ) : null,
          )}
        </Group>
      </Canvas>
    </View>
  );
}
