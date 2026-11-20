import type { Equipment, Level, Muscle, PatternFamily } from '@repwise/content';
import { router } from 'expo-router';
import { SearchX, Trash2, X } from 'lucide-react-native';
import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { haptics } from '@/services/haptics';
import { useTheme } from '@/theme';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  IconButton,
  Screen,
  Segmented,
  Sheet,
  Text,
  TextField,
  showToast,
} from '@/ui';

import { BodyMap } from '../components/BodyMap';
import { useCustomItems } from '../hooks/useLibrary';
import {
  EMPTY_DRAFT,
  NAME_MAX,
  isValid,
  rowToDraft,
  validateDraft,
  type CustomExerciseDraft,
} from '../logic/customExercise';
import { toggle } from '../logic/filters';
import {
  EQUIPMENT,
  EQUIPMENT_LABEL,
  LEVELS,
  LEVEL_LABEL,
  MUSCLES,
  MUSCLE_LABEL,
  PATTERN_FAMILIES,
  PATTERN_LABEL,
} from '../logic/labels';
import { useLibraryPrefs } from '../prefs';
import {
  createCustomExercise,
  deleteCustomExercise,
  updateCustomExercise,
  useCustomExercise,
} from '../repo';

function Field({ title, error, children }: { title: string; error?: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.xs }}>
      <Text variant="headline" accessibilityRole="header">
        {title}
      </Text>
      {children}
      {error ? (
        <Text
          variant="caption"
          color="danger"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function ChipGrid<T extends string>({
  values,
  labels,
  selected,
  onToggle,
  id,
  disabled,
}: {
  values: readonly T[];
  labels: Record<T, string>;
  selected: readonly T[];
  onToggle: (v: T) => void;
  id: string;
  disabled?: readonly T[];
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs }}>
      {values.map((v) => (
        <Chip
          key={v}
          label={labels[v]}
          selected={selected.includes(v)}
          disabled={disabled?.includes(v)}
          onPress={() => onToggle(v)}
          testID={`custom-${id}-${v}`}
        />
      ))}
    </View>
  );
}

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/library');
}

/** RW-28 create / edit a custom exercise (stored in the synced `exercises` table). */
export function CustomExerciseScreen({ id }: { id?: string }) {
  const t = useTheme();
  const editing = Boolean(id);
  const { row, loaded } = useCustomExercise(id ?? '');
  const { items: customs } = useCustomItems();
  const forget = useLibraryPrefs((s) => s.forget);
  const [draft, setDraft] = useState<CustomExerciseDraft>(EMPTY_DRAFT);
  const [seeded, setSeeded] = useState(!editing);
  const [submitted, setSubmitted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Seed the form once the row has loaded (derived during render, no effect).
  if (editing && row && !seeded) {
    setSeeded(true);
    setDraft(rowToDraft(row));
  }

  const takenNames = useMemo(
    () => customs.filter((c) => c.id !== id).map((c) => c.name),
    [customs, id],
  );
  const errors = validateDraft(draft, takenNames);
  const shown = submitted ? errors : {};
  const set = (patch: Partial<CustomExerciseDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const save = () => {
    setSubmitted(true);
    if (!isValid(errors)) {
      haptics.light();
      return;
    }
    let targetId = id;
    if (id) updateCustomExercise(id, draft);
    else targetId = createCustomExercise(draft).id;
    // Not a core action: the button already ticked on commit, so the toast stays silent.
    showToast({
      message: editing ? 'Exercise updated' : 'Exercise created',
      tone: 'success',
      silent: true,
    });
    if (editing || !targetId) leave();
    else router.replace({ pathname: '/exercise/[id]', params: { id: targetId } });
  };

  const remove = () => {
    if (!id) return;
    deleteCustomExercise(id);
    forget(id);
    setConfirmDelete(false);
    showToast({ message: 'Exercise deleted' });
    if (router.canDismiss()) router.dismissAll();
    else router.replace('/library');
  };

  if (editing && loaded && !row) {
    return (
      <Screen
        testID="screen-custom-exercise"
        headerLeft={<IconButton icon={X} accessibilityLabel="Close" onPress={leave} />}
      >
        <EmptyState
          icon={SearchX}
          title="Exercise not found"
          body="It may have been deleted."
          actionLabel="Back to library"
          onAction={() => router.replace('/library')}
          testID="custom-missing"
        />
      </Screen>
    );
  }

  return (
    <>
      <Screen
        keyboard
        title={editing ? 'Edit exercise' : 'New exercise'}
        testID="screen-custom-exercise"
        headerLeft={
          <IconButton icon={X} accessibilityLabel="Close" onPress={leave} testID="custom-close" />
        }
        footer={
          <Button
            label={editing ? 'Save changes' : 'Create exercise'}
            onPress={save}
            disabled={editing && !seeded}
            testID="custom-save"
          />
        }
      >
        <TextField
          label="Name"
          value={draft.name}
          onChangeText={(name) => set({ name })}
          placeholder="e.g. Landmine row"
          maxLength={NAME_MAX + 10}
          autoCapitalize="sentences"
          returnKeyType="done"
          error={shown.name}
          testID="custom-name"
        />
        <Card>
          <BodyMap
            primary={draft.primaryMuscles}
            secondary={draft.secondaryMuscles}
            maxHeight={t.sizes.ringHero - t.spacing.xxxl}
          />
        </Card>
        <Field title="Main muscles" error={shown.primaryMuscles}>
          <ChipGrid<Muscle>
            id="primary"
            values={MUSCLES}
            labels={MUSCLE_LABEL}
            selected={draft.primaryMuscles}
            onToggle={(m) =>
              set({
                primaryMuscles: toggle(draft.primaryMuscles, m),
                secondaryMuscles: draft.secondaryMuscles.filter((x) => x !== m),
              })
            }
          />
        </Field>
        <Field title="Also works (optional)">
          <ChipGrid<Muscle>
            id="secondary"
            values={MUSCLES}
            labels={MUSCLE_LABEL}
            selected={draft.secondaryMuscles}
            disabled={draft.primaryMuscles}
            onToggle={(m) => set({ secondaryMuscles: toggle(draft.secondaryMuscles, m) })}
          />
        </Field>
        <Field title="Equipment" error={shown.equipment}>
          <ChipGrid<Equipment>
            id="equipment"
            values={EQUIPMENT}
            labels={EQUIPMENT_LABEL}
            selected={draft.equipment}
            onToggle={(e) => set({ equipment: toggle(draft.equipment, e) })}
          />
        </Field>
        <Field title="Movement (optional)">
          <ChipGrid<PatternFamily>
            id="pattern"
            values={PATTERN_FAMILIES}
            labels={PATTERN_LABEL}
            selected={draft.patternFamily ? [draft.patternFamily] : []}
            onToggle={(p) => set({ patternFamily: draft.patternFamily === p ? null : p })}
          />
        </Field>
        <Field title="Level">
          <Segmented<Level>
            accessibilityLabel="Level"
            options={LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] }))}
            value={draft.level ?? 'beginner'}
            onChange={(level) => set({ level })}
            testID="custom-level"
          />
        </Field>
        <TextField
          label="Steps (optional)"
          hint="One step per line."
          value={draft.steps}
          onChangeText={(steps) => set({ steps })}
          multiline
          textAlignVertical="top"
          error={shown.steps}
          testID="custom-steps"
        />
        <TextField
          label="Cues (optional)"
          hint="One cue per line."
          value={draft.tips}
          onChangeText={(tips) => set({ tips })}
          multiline
          textAlignVertical="top"
          testID="custom-tips"
        />
        {editing ? (
          <Button
            label="Delete exercise"
            variant="tertiary"
            icon={Trash2}
            onPress={() => setConfirmDelete(true)}
            testID="custom-delete"
          />
        ) : null}
      </Screen>
      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete exercise?"
        testID="delete-sheet"
      >
        <Text variant="body" color="textSecondary">
          It leaves your library. Sets you already logged stay in your history.
        </Text>
        <Button
          label="Delete"
          variant="destructive"
          onPress={remove}
          testID="custom-delete-confirm"
        />
      </Sheet>
    </>
  );
}
