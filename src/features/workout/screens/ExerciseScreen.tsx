import { router } from 'expo-router';
import { ChevronLeft, ChevronRight, Dumbbell, Plus, Repeat } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { useTheme } from '@/theme';
import { Button, Card, EmptyState, IconButton, Screen, Text, TextField } from '@/ui';

import { RestTimerPill } from '../components/RestTimer';
import { SetRow } from '../components/SetRow';
import { SkeletonList } from '../components/Skeleton';
import { usePlayer } from '../hooks/usePlayer';
import { setExerciseNotes } from '../repo';

/** S14 Workout player — one exercise: media, cues, set rows with previous, notes, swap. */
export function ExerciseScreen({ sessionId, seId }: { sessionId: string; seId: string }) {
  const t = useTheme();
  const p = usePlayer(sessionId);
  const index = p.items.findIndex((i) => i.se.id === seId);
  const item = index >= 0 ? p.items[index] : undefined;
  const [notes, setNotes] = useState<string | null>(null);

  const back = () => (router.canGoBack() ? router.back() : router.replace(`/workout/${sessionId}`));
  const backButton = <IconButton icon={ChevronLeft} accessibilityLabel="Back to workout" onPress={back} testID="ex-back" />;

  if (!p.catalog || !p.live.loaded) {
    return (
      <Screen headerLeft={backButton} testID="screen-exercise">
        <SkeletonList count={2} testID="ex-loading" />
      </Screen>
    );
  }
  if (!item) {
    return (
      <Screen headerLeft={backButton} testID="screen-exercise">
        <EmptyState icon={Dumbbell} title="Exercise not in this workout" actionLabel="Back to workout" onAction={back} testID="ex-missing" />
      </Screen>
    );
  }

  const prev = p.items[index - 1];
  const next = p.items[index + 1];
  const go = (target: typeof item | undefined) => target && router.replace(`/workout/${sessionId}/ex/${target.se.id}`);
  const running = p.session?.status === 'active' || p.session?.status === 'paused';
  const shownNotes = notes ?? item.se.notes ?? '';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen
        title={item.meta.name}
        headerLeft={backButton}
        headerRight={
          <View style={{ flexDirection: 'row' }}>
            <IconButton icon={ChevronLeft} accessibilityLabel="Previous exercise" disabled={!prev} onPress={() => go(prev)} testID="ex-prev" />
            <IconButton icon={ChevronRight} accessibilityLabel="Next exercise" disabled={!next} onPress={() => go(next)} testID="ex-next" />
          </View>
        }
        footer={
          <>
            <RestTimerPill view={p.rest} onPress={p.openRest} />
            <Button
              label={next ? `Next: ${next.meta.name}` : 'Back to workout'}
              onPress={() => (next ? go(next) : back())}
              testID="ex-footer"
            />
          </>
        }
        testID="screen-exercise"
      >
        <Text variant="callout" color="textSecondary">
          {[`${index + 1} of ${p.items.length}`, item.meta.primaryMuscles.join(', ')].filter(Boolean).join(' · ')}
        </Text>

        <Card>
          <View
            accessible
            accessibilityLabel={`${item.meta.name} demonstration`}
            style={{
              height: t.sizes.ring * 1.5,
              borderRadius: t.radius.card,
              backgroundColor: t.colors.surface2,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Dumbbell color={t.colors.textTertiary} size={t.sizes.icon * 2} strokeWidth={t.sizes.iconStroke} />
          </View>
          {item.meta.cues.length ? (
            <View style={{ gap: t.spacing.xxs, marginTop: t.spacing.sm }}>
              {item.meta.cues.slice(0, 3).map((c) => (
                <Text key={c} variant="callout" color="textSecondary">
                  • {c}
                </Text>
              ))}
            </View>
          ) : null}
        </Card>

        {running ? (
          <View style={{ gap: t.spacing.xxs }} testID="ex-sets">
            {item.sets.map((s, i) => (
              <SetRow
                key={s.id}
                set={s}
                label={item.labels[i] ?? String(i + 1)}
                previous={item.previous[i]}
                unit={p.unit}
                cardio={item.meta.cardio}
                isPR={p.prSetIds.has(s.id)}
                onToggle={(set, patch) => p.handlers.onToggle(item, set, patch)}
                onCommit={p.handlers.onCommit}
                onOpenSet={(set) => p.handlers.onOpenSet(item, set)}
                testID={`ex-set-${i}`}
              />
            ))}
            <Button label="Add set" icon={Plus} variant="tertiary" onPress={() => p.handlers.onAddSet(item)} testID="ex-add-set" />
          </View>
        ) : (
          <Text variant="body" color="textSecondary">
            {item.se.targetSets ?? 3} sets × {item.se.targetReps ?? '8-12'} reps. Start the workout to log sets.
          </Text>
        )}

        <Button label="Swap exercise" icon={Repeat} variant="secondary" onPress={() => p.handlers.onSwap(item)} testID="ex-swap" />

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
    </KeyboardAvoidingView>
  );
}
