import { router } from 'expo-router';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Plus,
  Repeat,
} from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { ExerciseHero } from '@/features/library';
import { useTheme } from '@/theme';
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Screen,
  SkeletonCard,
  SkeletonGroup,
  Skeleton,
  Text,
  TextField,
} from '@/ui';

import { ExerciseCard } from '../components/ExerciseCard';
import { PRCelebration } from '../components/PRCelebration';
import { RestBar } from '../components/RestTimer';
import { usePlayer } from '../hooks/usePlayer';
import { useWorkoutKeepAwake } from '../hooks/useWorkoutKeepAwake';
import { nextPending, setTarget } from '../logic/player';
import { optimisticSets, useOptimisticVersion } from '../optimistic';
import { setExerciseNotes } from '../repo';

const shownDone = (s: { id: string; doneAt: number | null }) =>
  optimisticSets.isDone(s.id, s.doneAt != null);

/**
 * S14 Workout player — one exercise: the library's demo hero, cues, set rows with last time,
 * notes, swap. Thumb zone: rest bar, then previous / Log set / next. Screen stays awake.
 */
export function ExerciseScreen({ sessionId, seId }: { sessionId: string; seId: string }) {
  const t = useTheme();
  const p = usePlayer(sessionId);
  useOptimisticVersion();
  const index = p.items.findIndex((i) => i.se.id === seId);
  const item = index >= 0 ? p.items[index] : undefined;
  const [notes, setNotes] = useState<string | null>(null);
  useWorkoutKeepAwake(p.session?.status === 'active');

  const back = () => (router.canGoBack() ? router.back() : router.replace(`/workout/${sessionId}`));
  const backButton = (
    <IconButton
      icon={ChevronDown}
      accessibilityLabel="Back to workout"
      onPress={back}
      testID="ex-back"
    />
  );

  if (!p.catalog || !p.live.loaded) {
    return (
      <Screen headerLeft={backButton} testID="screen-exercise">
        <SkeletonGroup label="Loading exercise" testID="ex-loading">
          <Skeleton height={t.sizes.ringHero} radius={t.radius.card} />
          <SkeletonCard lines={3} />
        </SkeletonGroup>
      </Screen>
    );
  }
  if (!item) {
    return (
      <Screen headerLeft={backButton} testID="screen-exercise">
        <EmptyState
          icon={Dumbbell}
          title="Exercise not in this workout"
          actionLabel="Back to workout"
          onAction={back}
          testID="ex-missing"
        />
      </Screen>
    );
  }

  const prev = p.items[index - 1];
  const next = p.items[index + 1];
  const go = (target: typeof item | undefined) =>
    target && router.replace(`/workout/${sessionId}/ex/${target.se.id}`);
  const running = p.session?.status === 'active' || p.session?.status === 'paused';
  const shownNotes = notes ?? item.se.notes ?? '';
  const pending = running ? nextPending([item], shownDone) : null;
  const target = pending
    ? setTarget(
        { ...pending.set, ...(optimisticSets.get(pending.set.id)?.patch ?? {}) },
        p.unit,
        item.meta.cardio,
      ) ||
      (item.previous[pending.setIndex]
        ? setTarget(item.previous[pending.setIndex]!, p.unit, item.meta.cardio)
        : '')
    : '';

  const primary = pending ? (
    <Button
      label={`Log set ${pending.label}${target ? ` · ${target}` : ''}`}
      icon={Check}
      accent
      onPress={() => p.logNext(item)}
      testID="ex-log"
      style={{ flex: 1, minHeight: t.sizes.hitGymLarge }}
    />
  ) : (
    <Button
      label={next ? `Next: ${next.meta.name}` : 'Back to workout'}
      onPress={() => (next ? go(next) : back())}
      testID="ex-footer"
      style={{ flex: 1, minHeight: t.sizes.hitGymLarge }}
    />
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen
        title={item.meta.name}
        headerLeft={backButton}
        footer={
          <>
            {running ? <RestBar onOpen={p.openRest} /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}>
              <IconButton
                icon={ChevronLeft}
                accessibilityLabel="Previous exercise"
                disabled={!prev}
                onPress={() => go(prev)}
                testID="ex-prev"
              />
              {primary}
              <IconButton
                icon={ChevronRight}
                accessibilityLabel="Next exercise"
                disabled={!next}
                onPress={() => go(next)}
                testID="ex-next"
              />
            </View>
          </>
        }
        testID="screen-exercise"
      >
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: t.spacing.xs,
          }}
        >
          <Text variant="callout" color="textSecondary" tabular>
            Exercise {index + 1} of {p.items.length}
          </Text>
          {item.meta.primaryMuscles.slice(0, 3).map((m) => (
            <Badge key={m} label={m} />
          ))}
        </View>

        <ExerciseHero mediaId={item.meta.mediaId} name={item.meta.name} testID="ex-media" />

        {item.meta.cues.length ? (
          <View style={{ gap: t.spacing.xxs }} testID="ex-cues">
            {item.meta.cues.slice(0, 3).map((c) => (
              <Text key={c} variant="body" color="textSecondary">
                • {c}
              </Text>
            ))}
          </View>
        ) : null}

        {running ? (
          <View testID="ex-sets">
            <ExerciseCard
              item={item}
              index={index}
              unit={p.unit}
              prSetIds={p.prSetIds}
              activeSetId={pending?.set.id ?? null}
              handlers={p.handlers}
              bare
              testID="ex"
            />
          </View>
        ) : (
          <Text variant="body" color="textSecondary">
            {item.se.targetSets ?? 3} sets × {item.se.targetReps ?? '8-12'} reps. Start the workout
            to log sets.
          </Text>
        )}

        {running ? null : (
          <Button
            label="Add set"
            icon={Plus}
            variant="tertiary"
            onPress={() => p.handlers.onAddSet(item)}
            testID="ex-add-set"
          />
        )}
        <Button
          label="Swap exercise"
          icon={Repeat}
          variant="secondary"
          onPress={() => p.handlers.onSwap(item)}
          testID="ex-swap"
        />

        <TextField
          label="Notes"
          value={shownNotes}
          onChangeText={setNotes}
          onEndEditing={() => notes !== null && setExerciseNotes(item.se.id, notes)}
          placeholder="Seat height, grip, how it felt"
          multiline
          testID="ex-notes"
        />
      </Screen>
      {p.sheets}
      <PRCelebration moment={p.prMoment} onDone={p.clearPrMoment} />
    </KeyboardAvoidingView>
  );
}
