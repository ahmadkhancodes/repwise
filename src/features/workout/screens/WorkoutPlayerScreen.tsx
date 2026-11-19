import { router } from 'expo-router';
import { Calculator, ChevronDown, Dumbbell, Pause, Play, Plus, TriangleAlert } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { useTheme } from '@/theme';
import { Button, Chip, EmptyState, IconButton, Screen, Sheet, Text } from '@/ui';

import { pausedSince } from '../actions';
import { ExerciseCard } from '../components/ExerciseCard';
import { RestTimerPill } from '../components/RestTimer';
import { SkeletonList } from '../components/Skeleton';
import { WorkoutProgressBar } from '../components/WorkoutProgressBar';
import { useNow } from '../hooks/useNow';
import { usePlayer } from '../hooks/usePlayer';
import { activeMs, estimateMinutes, formatClock } from '../logic/duration';
import { doneFraction } from '../logic/sets';

/**
 * S13 Workout player (list) — and, before Start, S09 Session overview (exercises, time, muscles).
 * Works fully offline: every tap is a local SQLite write; the rest timer survives backgrounding.
 */
export function WorkoutPlayerScreen({ sessionId }: { sessionId: string }) {
  const t = useTheme();
  const p = usePlayer(sessionId);
  const { session, items, catalog } = p;
  const status = session?.status ?? null;
  const running = status === 'active';
  const now = useNow(1000, running);
  const [confirmFinish, setConfirmFinish] = useState(false);

  useEffect(() => {
    if (status === 'done') router.replace(`/workout/${sessionId}/summary`);
  }, [status, sessionId]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/train'));
  const closeButton = (
    <IconButton icon={ChevronDown} accessibilityLabel="Close workout" onPress={close} testID="player-close" />
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
        <SkeletonList testID="player-loading" />
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
  const pendingSets = items.reduce((a, i) => a + i.sets.filter((s) => s.doneAt == null).length, 0);
  const finish = () => (pendingSets > 0 ? setConfirmFinish(true) : p.finish());

  const headerRight = (
    <View style={{ flexDirection: 'row' }}>
      <IconButton
        icon={Calculator}
        accessibilityLabel="Plate and 1RM tools"
        onPress={() => router.push('/workout/tools')}
        testID="player-tools"
      />
      {overview ? null : (
        <IconButton
          icon={paused ? Play : Pause}
          accessibilityLabel={paused ? 'Resume workout' : 'Pause workout'}
          onPress={paused ? p.resume : p.pause}
          testID="player-pause"
        />
      )}
    </View>
  );

  const muscles = [...new Set(items.flatMap((i) => i.meta.primaryMuscles))].slice(0, 6);
  const minutes = estimateMinutes(items.map((i) => ({ sets: i.se.targetSets ?? 3, restS: i.se.restS })));

  const footer = overview ? (
    <Button
      label="Start workout"
      accent
      onPress={p.start}
      disabled={items.length === 0}
      testID="player-start"
    />
  ) : (
    <>
      <RestTimerPill view={p.rest} onPress={p.openRest} />
      <Button label="Finish workout" onPress={finish} disabled={items.length === 0} testID="player-finish" />
    </>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen title={title} headerLeft={closeButton} headerRight={headerRight} footer={footer} testID="screen-workout">
        {overview ? (
          <View style={{ gap: t.spacing.sm }} testID="player-overview">
            <Text variant="body" color="textSecondary">
              {items.length} exercises · about {minutes} min
            </Text>
            {muscles.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs }}>
                {muscles.map((m) => (
                  <Chip key={m} label={m} />
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <View style={{ gap: t.spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Text
                variant="title2"
                tabular
                testID="player-clock"
                accessibilityLabel={`Workout time ${formatClock(activeMs(session, now, paused ? pausedSince(sessionId) : null))}`}
              >
                {formatClock(activeMs(session, now, paused ? pausedSince(sessionId) : null))}
              </Text>
              {paused ? (
                <Text variant="callout" color="textSecondary">
                  Paused
                </Text>
              ) : null}
            </View>
            <WorkoutProgressBar fractions={items.map((i) => doneFraction(i.sets))} testID="player-progress" />
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
              {...p.handlers}
            />
          ))
        )}

        {items.length > 0 ? (
          <Button label="Add exercise" icon={Plus} variant="secondary" onPress={addExercise} testID="player-add" />
        ) : null}
      </Screen>
      {p.sheets}
      <Sheet open={confirmFinish} onClose={() => setConfirmFinish(false)} title="Finish workout?" testID="finish-sheet">
        {confirmFinish ? (
          <View style={{ gap: t.spacing.sm }}>
            <Text variant="body" color="textSecondary">
              {pendingSets === 1 ? '1 set isn’t ticked' : `${pendingSets} sets aren’t ticked`}. They won’t be saved.
            </Text>
            <Button
              label="Finish workout"
              onPress={() => {
                setConfirmFinish(false);
                p.finish();
              }}
              testID="finish-confirm"
            />
            <Button label="Keep going" variant="secondary" onPress={() => setConfirmFinish(false)} testID="finish-cancel" />
            <Button label="Discard workout" variant="tertiary" onPress={p.discard} testID="finish-discard" />
          </View>
        ) : null}
      </Sheet>
    </KeyboardAvoidingView>
  );
}
