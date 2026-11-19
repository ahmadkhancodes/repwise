import { router } from 'expo-router';
import { ArrowDown, ArrowUp, ChevronLeft, ListPlus, Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { routinesRepo } from '@/features/library/repo';
import { useCatalog } from '@/services/catalog';
import { useTheme } from '@/theme';
import { Button, Card, Chip, EmptyState, IconButton, Screen, Sheet, Stepper, Text, TextField, showToast } from '@/ui';

import { startWorkoutAction } from '../actions';
import { SkeletonList } from '../components/Skeleton';
import { exerciseMeta } from '../exerciseMeta';
import { useLiveValue } from '../hooks/useLiveValue';
import { localDate } from '../logic/dates';
import { moveItem } from '../logic/order';
import { parseRoutineItems, routineSetCount, type RoutineItem } from '../logic/routines';
import { createSession } from '../repo';

const REPS = ['5', '6-8', '8-12', '10-15', '15-20'];
const RESTS = [60, 90, 120, 180];

/** S16 Routine builder: name, exercises with sets/reps/rest, reorder, start. Saves as you go. */
export function RoutineBuilderScreen({ routineId }: { routineId: string }) {
  const t = useTheme();
  const catalog = useCatalog();
  const { data: routine, loaded } = useLiveValue(() => routinesRepo.get(routineId) ?? null, ['routines'], [routineId]);
  const [name, setName] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/train'));
  const backButton = <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={back} testID="routine-back" />;

  if (!loaded || !catalog) {
    return (
      <Screen headerLeft={backButton} testID="screen-routine">
        <SkeletonList testID="routine-loading" />
      </Screen>
    );
  }
  if (!routine) {
    return (
      <Screen headerLeft={backButton} testID="screen-routine">
        <EmptyState icon={ListPlus} title="Routine not found" actionLabel="Back" onAction={back} testID="routine-missing" />
      </Screen>
    );
  }

  const items = parseRoutineItems(routine.items);
  const save = (next: RoutineItem[]) => routinesRepo.update(routineId, { items: next });
  const patchItem = (i: number, patch: Partial<RoutineItem>) =>
    save(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const editItem = editing !== null ? items[editing] : undefined;

  const start = () => {
    const s = createSession({
      date: localDate(),
      title: routine.name,
      exercises: items.map((it) => ({ exerciseId: it.exerciseId, targetSets: it.sets, targetReps: it.reps, restS: it.restS })),
    });
    startWorkoutAction(s.id, catalog);
    router.replace(`/workout/${s.id}`);
  };
  const remove = () => {
    routinesRepo.remove(routineId);
    showToast({ message: 'Routine deleted' });
    back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen
        title={routine.name}
        headerLeft={backButton}
        headerRight={<IconButton icon={Trash2} accessibilityLabel="Delete routine" onPress={remove} testID="routine-delete" />}
        footer={<Button label="Start workout" accent onPress={start} disabled={items.length === 0} testID="routine-start" />}
        testID="screen-routine"
      >
        <TextField
          label="Name"
          value={name ?? routine.name}
          onChangeText={setName}
          onEndEditing={() => {
            const n = name?.trim();
            if (n && n !== routine.name) routinesRepo.update(routineId, { name: n });
          }}
          maxLength={40}
          testID="routine-name"
        />
        <Text variant="callout" color="textSecondary">
          {items.length} exercises · {routineSetCount(items)} sets
        </Text>
        {items.length === 0 ? (
          <EmptyState icon={ListPlus} title="Add your first exercise" body="Build the session you like and start it in one tap." testID="routine-empty" />
        ) : (
          items.map((it, i) => {
            const meta = exerciseMeta(it.exerciseId, catalog);
            return (
              <Card key={`${it.exerciseId}-${i}`} onPress={() => setEditing(i)} accessibilityLabel={`${meta.name}, ${it.sets} sets of ${it.reps}. Edit`} testID={`routine-item-${i}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="headline">{meta.name}</Text>
                    <Text variant="caption" color="textSecondary" tabular>
                      {it.sets} × {it.reps} · {it.restS} s rest
                    </Text>
                  </View>
                  <IconButton icon={ArrowUp} accessibilityLabel={`Move ${meta.name} up`} disabled={i === 0} feedback="selection" onPress={() => save(moveItem(items, i, i - 1))} testID={`routine-up-${i}`} />
                  <IconButton icon={ArrowDown} accessibilityLabel={`Move ${meta.name} down`} disabled={i === items.length - 1} feedback="selection" onPress={() => save(moveItem(items, i, i + 1))} testID={`routine-down-${i}`} />
                </View>
              </Card>
            );
          })
        )}
        <Button label="Add exercise" icon={Plus} variant="secondary" onPress={() => router.push(`/workout/pick?routine=${routineId}`)} testID="routine-add" />
      </Screen>
      <Sheet open={editItem !== undefined} onClose={() => setEditing(null)} title={editItem ? exerciseMeta(editItem.exerciseId, catalog).name : ''} testID="routine-item-sheet">
        {editItem && editing !== null ? (
          <View style={{ gap: t.spacing.md }}>
            <Stepper label="Sets" value={editItem.sets} onChange={(sets) => patchItem(editing, { sets })} min={1} max={10} unit="sets" testID="routine-sets" />
            <Text variant="callout" color="textSecondary">
              Reps
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs }}>
              {REPS.map((r) => (
                <Chip key={r} label={r} selected={editItem.reps === r} onPress={() => patchItem(editing, { reps: r })} testID={`routine-reps-${r}`} />
              ))}
            </View>
            <Text variant="callout" color="textSecondary">
              Rest
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs }}>
              {RESTS.map((r) => (
                <Chip key={r} label={`${r} s`} selected={editItem.restS === r} onPress={() => patchItem(editing, { restS: r })} testID={`routine-rest-${r}`} />
              ))}
            </View>
            <Button
              label="Remove exercise"
              icon={Trash2}
              variant="destructive"
              onPress={() => {
                save(items.filter((_, j) => j !== editing));
                setEditing(null);
              }}
              testID="routine-remove-item"
            />
          </View>
        ) : null}
      </Sheet>
    </KeyboardAvoidingView>
  );
}
