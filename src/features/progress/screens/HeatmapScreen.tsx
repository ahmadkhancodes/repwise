import { Activity } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { BackButton, Card, EmptyState, PressableScale, Screen, SectionHeader, Segmented, Text } from '@/ui';
import { useTheme } from '@/theme';

import {
  BodyHeatmap,
  bodyPalette,
  heatLegend,
  viewMuscles,
  type BodyView,
} from '@/features/library';

import { HeatmapSkeleton } from '../components/Skeletons';

import { useNow, useTraining } from '../hooks/useProgress';
import type { Muscle } from '../logic/engine';
import { muscleLabel, rankMuscles, recoveryHeatmap, recoveryLabel } from '../logic/muscles';

/** S32 Muscle heatmap (W6): front/back body that glows by recent work, plus a readable list. */
export function HeatmapScreen({ now: nowOverride }: { now?: number }) {
  const t = useTheme();
  const training = useTraining();
  const [view, setView] = useState<BodyView>('front');
  const [selected, setSelected] = useState<Muscle | null>(null);
  const now = useNow(nowOverride);
  const heatmap = useMemo(
    () => recoveryHeatmap(training.sets, training.exById, now),
    [training.sets, training.exById, now],
  );
  const ranked = useMemo(() => rankMuscles(heatmap), [heatmap]);
  const legend = useMemo(
    () => heatLegend(bodyPalette(t.colors, t.scheme, 'bg')),
    [t.colors, t.scheme],
  );
  const worked = ranked.filter((r) => r.sets > 0);
  const focus = selected ?? worked[0]?.muscle ?? null;
  const back = <BackButton fallback="/progress" />;

  const select = (m: Muscle) => {
    setSelected(m);
    if (!viewMuscles(view).includes(m)) setView(view === 'front' ? 'back' : 'front');
  };

  return (
    <Screen title="Muscle recovery" headerLeft={back} testID="screen-progress-heatmap">
      {training.loading ? (
        <HeatmapSkeleton />
      ) : (
        <>
          <Segmented
            testID="heatmap-view"
            accessibilityLabel="Body side"
            options={[
              { value: 'front', label: 'Front' },
              { value: 'back', label: 'Back' },
            ]}
            value={view}
            onChange={setView}
          />
          <BodyHeatmap
            heat={heatmap}
            view={view}
            selected={focus}
            onSelect={select}
            accessibilityLabel={mapLabel(view, worked)}
            testID="body-map"
          />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: t.spacing.md,
            }}
          >
            {legend.map((l) => (
              <Legend key={l.key} label={l.label} color={l.color} />
            ))}
          </View>

          {worked.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="All muscles fresh"
              body="Finish a workout and the muscles you trained light up here for a few days."
              testID="heatmap-empty"
            />
          ) : (
            <>
              {focus ? (
                <Animated.View key={focus} entering={FadeIn.duration(t.motion.duration.base)}>
                  <Card testID="heatmap-focus">
                    <Text variant="headline">{muscleLabel(focus)}</Text>
                    <Text variant="callout" color="textSecondary" tabular>
                      {`${recoveryLabel(heatmap[focus].recovery)} · ${Math.round(heatmap[focus].recovery * 100)}% recovered · ${heatmap[focus].setsLast7d} hard sets in 7 days`}
                    </Text>
                  </Card>
                </Animated.View>
              ) : null}
              <SectionHeader title="This week" />
              <View style={{ gap: t.spacing.xs }}>
                {worked.map((r) => (
                  <PressableScale
                    key={r.muscle}
                    feedback="selection"
                    onPress={() => select(r.muscle)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: r.muscle === focus }}
                    accessibilityLabel={`${muscleLabel(r.muscle)}, ${recoveryLabel(r.recovery)}, ${r.sets} hard sets`}
                    testID={`muscle-${r.muscle}`}
                    style={{
                      minHeight: t.sizes.touch,
                      justifyContent: 'center',
                      gap: t.spacing.xxs,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text
                        variant="body"
                        color={r.muscle === focus ? 'textPrimary' : 'textSecondary'}
                      >
                        {muscleLabel(r.muscle)}
                      </Text>
                      <Text variant="callout" color="textSecondary" tabular>
                        {`${r.sets} sets · ${recoveryLabel(r.recovery)}`}
                      </Text>
                    </View>
                    <View
                      style={{
                        height: t.spacing.xs,
                        borderRadius: t.radius.pill,
                        backgroundColor: t.colors.surface2,
                        overflow: 'hidden',
                      }}
                    >
                      <View
                        style={{
                          height: t.spacing.xs,
                          width: `${Math.max(4, r.fatigue * 100)}%`,
                          backgroundColor: t.colors.accent,
                          borderRadius: t.radius.pill,
                        }}
                      />
                    </View>
                  </PressableScale>
                ))}
              </View>
              <Text variant="caption" color="textTertiary">
                Based on hard sets in the last 7 days. Bigger muscles take longer to feel fresh.
              </Text>
            </>
          )}
        </>
      )}
    </Screen>
  );
}

/** "Front muscle map. Quads recovering, Chest fresh-ish." for screen readers. */
function mapLabel(view: BodyView, worked: { muscle: Muscle; recovery: number }[]): string {
  const side = view === 'front' ? 'Front' : 'Back';
  const shown = worked.filter((w) => viewMuscles(view).includes(w.muscle));
  const summary = shown
    .map((w) => `${muscleLabel(w.muscle)} ${recoveryLabel(w.recovery).toLowerCase()}`)
    .join(', ');
  return `${side} muscle map. ${summary || 'All muscles shown are fresh.'}`;
}

function Legend({ label, color }: { label: string; color: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xxs }}>
      <View
        style={{
          width: t.spacing.sm,
          height: t.spacing.sm,
          borderRadius: t.radius.pill,
          backgroundColor: color,
          borderWidth: t.sizes.hairline,
          borderColor: t.colors.border,
        }}
      />
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
    </View>
  );
}
