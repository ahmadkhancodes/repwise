import { router } from 'expo-router';
import {
  ArrowUpDown,
  Calculator,
  Check,
  ChevronDown,
  Dumbbell,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Trash2,
  TriangleAlert,
} from 'lucide-react-native';
import { memo, useEffect, useState } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Screen,
  Sheet,
  SkeletonCard,
  SkeletonGroup,
  SkeletonText,
  StepProgress,
  Text,
} from '@/ui';

import { pausedSince } from '../actions';
import { ExerciseCard } from '../components/ExerciseCard';
import { PRCelebration } from '../components/PRCelebration';
import { RestBar } from '../components/RestTimer';
import { ExerciseMenuSheet } from '../components/Sheets';
import { useNow } from '../hooks/useNow';
import { usePlayer, type PlayerController } from '../hooks/usePlayer';
import { useRestState } from '../hooks/useRestTimer';
import { useWorkoutKeepAwake } from '../hooks/useWorkoutKeepAwake';
import type { PlayerItem } from '../hooks/useWorkout';
import { activeMs, estimateMinutes, formatClock } from '../logic/duration';
import { nextPending, setTarget, workoutProgress } from '../logic/player';
import { optimisticSets, useOptimisticVersion } from '../optimistic';
import type { Session } from '../repo';

const shownDone = (s: { id: string; doneAt: number | null }) =>
  optimisticSets.isDone(s.id, s.doneAt != null);

/** Workout clock leaf (A1): only this ticks each second, not the whole player. Display size. */
const WorkoutClock = memo(function WorkoutClock({
  session,
  paused,
}: {
  session: Session;
  paused: boolean;
}) {
  const now = useNow(1000, !paused);
  const text = formatClock(activeMs(session, now, paused ? pausedSince(session.id) : null));
  return (
    <Text
      variant="display"
      tabular
      testID="player-clock"
      accessibilityLabel={`Workout time ${text}`}
    >
      {text}
    </Text>
  );
});

/** "Exercise 3 of 6 · Set 2 of 4" + trip progress: always shows where you are (B14). */
function ProgressHeader({ items }: { items: PlayerItem[] }) {
  const t = useTheme();
  useOptimisticVersion();
  const pr = workoutProgress(items, shownDone);
  return (
    <View style={{ gap: t.spacing.xs }}>
      <Text variant="headline" tabular testID="player-position">
        {pr.complete
          ? `All ${pr.setsTotal} sets done`
          : `Exercise ${pr.exerciseNo} of ${pr.exerciseCount} · Set ${pr.setNo} of ${pr.setCount}`}
      </Text>
      <StepProgress
        fractions={pr.fractions}
        color="accent"
        accessibilityLabel="Workout progress"
        testID="player-progress"
      />
    </View>
  );
}

/**
 * The thumb zone (B7): rest bar while resting, otherwise "Up next"; then ONE big action:
 * "Log set 2 · 80 kg × 8" while sets remain, "Finish workout" once all are done.
 */
function PlayerFooter({ p }: { p: PlayerController }) {
  const t = useTheme();
  useOptimisticVersion();
  const rest = useRestState();
  const next = nextPending(p.items, shownDone);
  const big = { minHeight: t.sizes.hitGymLarge };
  if (!next) {
    return (
      <>
        <RestBar onOpen={p.openRest} />
        <Button
          label="Finish workout"
          accent
          icon={Check}
          onPress={p.finish}
          disabled={p.items.length === 0}
          testID="player-finish-all"
          style={big}
        />
      </>
    );
  }
  const target = setTarget(
    { ...next.set, ...(optimisticSets.get(next.set.id)?.patch ?? {}) },
    p.unit,
    next.item.meta.cardio,
  );
  const prev = (next.item as PlayerItem).previous[next.setIndex];
  const shown = target || (prev ? setTarget(prev, p.unit, next.item.meta.cardio) : '');
  return (
    <>
      {rest.status === 'idle' ? (
        <View
          testID="player-up-next"
          accessible
          accessibilityLabel={`Up next: ${next.item.meta.name}, set ${next.label}${shown ? `, ${shown}` : ''}`}
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            gap: t.spacing.xs,
            paddingHorizontal: t.spacing.xxs,
          }}
        >
          <Text variant="caption" color="accentText">
            UP NEXT
          </Text>
          <Text variant="headline" numberOfLines={1} style={{ flexShrink: 1 }}>
            {next.item.meta.name}
          </Text>
        </View>
      ) : (
        <RestBar onOpen={p.openRest} />
      )}
      <Button
        label={`Log set ${next.label}${shown ? ` · ${shown}` : ''}`}
        icon={Check}
        accent
        onPress={() => p.logNext()}
        accessibilityLabel={`Log ${next.item.meta.name} set ${next.label}${shown ? `, ${shown}` : ''}`}
        testID="player-log"
        style={big}
      />
    </>
  );
}

/**
 * S13 Workout player (list) — and, before Start, S09 Session overview (exercises, time, muscles).
 * Works fully offline: every tap is optimistic and lands in local SQLite; the rest timer survives
 * backgrounding; the screen stays awake while the workout runs.
 */
export function WorkoutPlayerScreen({ sessionId }: { sessionId: string }) {
  const t = useTheme();
  const p = usePlayer(sessionId);
  const { session, items, catalog } = p;
  const status = session?.status ?? null;
  const [sheet, setSheet] = useState<'finish' | 'menu' | 'discard' | null>(null);
  useWorkoutKeepAwake(sessionId, status === 'active');
  useOptimisticVersion();

  useEffect(() => {
    if (status === 'done') router.replace(`/workout/${sessionId}/summary`);
  }, [status, sessionId]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/train'));
  const closeButton = (
    <IconButton
      icon={ChevronDown}
      accessibilityLabel="Close workout"
      onPress={close}
      testID="player-close"
    />
  );

  if (p.live.error) {
    return (
      <Screen headerLeft={closeButton} testID="screen-workout">
        <EmptyState
          icon={TriangleAlert}
          title="Couldn't open this workout"
          body="Your sets are safe on this phone. Close and try again."
          actionLabel="Close"
          onAction={close}
          testID="player-error"
        />
      </Screen>
    );
  }
  if (!catalog || !p.live.loaded) {
    return (
      <Screen headerLeft={closeButton} testID="screen-workout">
        <SkeletonGroup label="Loading workout" testID="player-loading">
          <SkeletonText variant="display" lines={1} lastLineWidth="40%" />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </SkeletonGroup>
      </Screen>
    );
  }
  if (!session) {
    return (
      <Screen headerLeft={closeButton} testID="screen-workout">
        <EmptyState
          icon={Dumbbell}
          title="Workout not found"
          body="It may have been deleted on another device."
          actionLabel="Back to Train"
          onAction={() => router.replace('/(tabs)/train')}
          testID="player-missing"
        />
      </Screen>
    );
  }

  const title = session.title ?? 'Workout';
  const overview = status === 'planned' || status === 'skipped';
  const paused = status === 'paused';
  const addExercise = () => router.push(`/workout/pick?session=${sessionId}`);
  const pendingSets = items.reduce((a, i) => a + i.sets.filter((s) => !shownDone(s)).length, 0);
  const finish = () => (pendingSets > 0 ? setSheet('finish') : p.finish());
  const activeSetId = overview ? null : (nextPending(items, shownDone)?.set.id ?? null);

  // Finish sits top-right (used once a session); the thumb zone belongs to "Log set" (B7).
  const headerRight = overview ? (
    <IconButton
      icon={Calculator}
      accessibilityLabel="Plate and 1RM tools"
      onPress={() => router.push('/workout/tools')}
      testID="player-tools"
    />
  ) : (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <IconButton
        icon={MoreHorizontal}
        accessibilityLabel="Workout options"
        onPress={() => setSheet('menu')}
        testID="player-menu"
      />
      <Button
        label="Finish"
        variant="tertiary"
        onPress={finish}
        disabled={items.length === 0}
        testID="player-finish"
      />
    </View>
  );

  const muscles = [...new Set(items.flatMap((i) => i.meta.primaryMuscles))].slice(0, 6);
  const minutes = estimateMinutes(
    items.map((i) => ({ sets: i.se.targetSets ?? 3, restS: i.se.restS })),
  );

  const footer = overview ? (
    <Button
      label="Start workout"
      accent
      onPress={p.start}
      disabled={items.length === 0}
      testID="player-start"
      style={{ minHeight: t.sizes.hitGymLarge }}
    />
  ) : items.length > 0 ? (
    <PlayerFooter p={p} />
  ) : undefined;

  return (
    <View style={{ flex: 1 }}>
      <Screen
        title={title}
        headerLeft={closeButton}
        headerRight={headerRight}
        footer={footer}
        testID="screen-workout"
      >
        {overview ? (
          <View style={{ gap: t.spacing.sm }} testID="player-overview">
            <Text variant="body" color="textSecondary">
              {items.length} exercises · about {minutes} min
            </Text>
            {muscles.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs }}>
                {muscles.map((m) => (
                  <Badge key={m} label={m} />
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <View style={{ gap: t.spacing.sm }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <WorkoutClock session={session} paused={paused} />
              {paused ? <Badge label="Paused" tone="inverse" testID="player-paused" /> : null}
            </View>
            {items.length > 0 ? <ProgressHeader items={items} /> : null}
          </View>
        )}

        {items.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title="No exercises yet"
            body="Add your first exercise to start logging."
            actionLabel="Add exercise"
            onAction={addExercise}
            testID="player-empty"
          />
        ) : (
          items.map((item, i) => (
            <ExerciseCard
              key={item.se.id}
              item={item}
              index={i}
              unit={p.unit}
              prSetIds={p.prSetIds}
              overview={overview}
              activeSetId={activeSetId}
              handlers={p.handlers}
            />
          ))
        )}

        {items.length > 0 ? (
          <Button
            label="Add exercise"
            icon={Plus}
            variant="secondary"
            onPress={addExercise}
            testID="player-add"
          />
        ) : null}
      </Screen>
      {p.sheets}

      <ExerciseMenuSheet
        open={sheet === 'menu'}
        title={title}
        onClose={() => setSheet(null)}
        testID="workout-menu"
        actions={[
          {
            key: 'pause',
            label: paused ? 'Resume workout' : 'Pause workout',
            icon: paused ? Play : Pause,
            onPress: () => {
              setSheet(null);
              if (paused) p.resume();
              else p.pause();
            },
          },
          {
            key: 'tools',
            label: 'Plate and 1RM tools',
            icon: Calculator,
            onPress: () => {
              setSheet(null);
              router.push('/workout/tools');
            },
          },
          {
            key: 'reorder-all',
            label: 'Reorder exercises',
            icon: ArrowUpDown,
            onPress: () => {
              setSheet(null);
              p.openReorder();
            },
          },
          {
            key: 'discard',
            label: 'Discard workout',
            icon: Trash2,
            destructive: true,
            onPress: () => setSheet('discard'),
          },
        ]}
      />

      <Sheet
        open={sheet === 'finish'}
        onClose={() => setSheet(null)}
        title="Finish workout?"
        testID="finish-sheet"
      >
        {sheet === 'finish' ? (
          <View style={{ gap: t.spacing.sm }}>
            <Text variant="body" color="textSecondary">
              {pendingSets === 1 ? '1 set isn’t ticked' : `${pendingSets} sets aren’t ticked`}. Did
              them but forgot to tick? Tick them all and finish.
            </Text>
            <Button
              label="Tick all and finish"
              icon={Check}
              accent
              onPress={() => {
                setSheet(null);
                p.finishMarkingDone();
              }}
              testID="finish-mark-done"
            />
            <Button
              label="Finish without them"
              variant="secondary"
              onPress={() => {
                setSheet(null);
                p.finish();
              }}
              testID="finish-confirm"
            />
            <Button
              label="Keep going"
              variant="tertiary"
              onPress={() => setSheet(null)}
              testID="finish-cancel"
            />
          </View>
        ) : null}
      </Sheet>

      <Sheet
        open={sheet === 'discard'}
        onClose={() => setSheet(null)}
        title="Discard this workout?"
        testID="discard-sheet"
      >
        {sheet === 'discard' ? (
          <View style={{ gap: t.spacing.sm }}>
            <Text variant="body" color="textSecondary">
              Every set you logged in this workout is removed. You can undo for 5 seconds.
            </Text>
            <Button
              label="Discard workout"
              variant="destructive"
              icon={Trash2}
              onPress={() => {
                setSheet(null);
                p.discard();
              }}
              testID="discard-confirm"
            />
            <Button
              label="Keep workout"
              variant="secondary"
              onPress={() => setSheet(null)}
              testID="discard-cancel"
            />
          </View>
        ) : null}
      </Sheet>

      <PRCelebration moment={p.prMoment} onDone={p.clearPrMoment} />
    </View>
  );
}
