import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { useTheme } from '@/theme';
import { Button, Chip, Sheet, Text } from '@/ui';

import {
  EMPTY_FILTERS,
  EQUIPMENT_GROUPS,
  MUSCLE_GROUPS,
  activeFilterCount,
  toggle,
  type EquipmentGroup,
  type LibraryFilters,
  type MuscleGroup,
} from '../logic/filters';
import { LEVELS, LEVEL_LABEL, PATTERN_FAMILIES, PATTERN_LABEL } from '../logic/labels';

type Props = {
  open: boolean;
  value: LibraryFilters;
  onClose: () => void;
  onApply: (f: LibraryFilters) => void;
  /** Live result count for a draft (catalogue search is < 50 ms, so this is instant). */
  countFor: (f: LibraryFilters) => number;
};

function Group<T extends string>({
  title,
  options,
  selected,
  onToggle,
  id,
}: {
  title: string;
  options: { value: T; label: string }[];
  selected: readonly T[];
  onToggle: (v: T) => void;
  id: string;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.xs }}>
      <Text variant="headline" accessibilityRole="header">
        {title}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs }}>
        {options.map((o) => (
          <Chip
            key={o.value}
            label={o.label}
            selected={selected.includes(o.value)}
            onPress={() => onToggle(o.value)}
            testID={`filter-${id}-${o.value}`}
          />
        ))}
      </View>
    </View>
  );
}

/** Filters bottom sheet (sheet 11: bottom sheets for secondary actions). One primary: Show N. */
export function FilterSheet({ open, value, onClose, onApply, countFor }: Props) {
  const t = useTheme();
  const [draft, setDraft] = useState(value);
  // Start from the applied filters each time the sheet opens (derived during render).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(value);
  }
  const count = countFor(draft);
  const { height } = useWindowDimensions();

  return (
    <Sheet open={open} onClose={onClose} title="Filters" testID="filter-sheet">
      <BottomSheetScrollView
        style={{ maxHeight: height * 0.55 }}
        contentContainerStyle={{ gap: t.spacing.lg, paddingBottom: t.spacing.xs }}
      >
        <Group
          id="muscle"
          title="Muscle"
          options={(Object.keys(MUSCLE_GROUPS) as MuscleGroup[]).map((k) => ({
            value: k,
            label: MUSCLE_GROUPS[k].label,
          }))}
          selected={draft.muscles}
          onToggle={(v) => setDraft((d) => ({ ...d, muscles: toggle(d.muscles, v) }))}
        />
        <Group
          id="equipment"
          title="Equipment"
          options={(Object.keys(EQUIPMENT_GROUPS) as EquipmentGroup[]).map((k) => ({
            value: k,
            label: EQUIPMENT_GROUPS[k].label,
          }))}
          selected={draft.equipment}
          onToggle={(v) => setDraft((d) => ({ ...d, equipment: toggle(d.equipment, v) }))}
        />
        <Group
          id="pattern"
          title="Movement"
          options={PATTERN_FAMILIES.map((p) => ({ value: p, label: PATTERN_LABEL[p] }))}
          selected={draft.patterns}
          onToggle={(v) => setDraft((d) => ({ ...d, patterns: toggle(d.patterns, v) }))}
        />
        <Group
          id="level"
          title="Level"
          options={LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] }))}
          selected={draft.levels}
          onToggle={(v) => setDraft((d) => ({ ...d, levels: toggle(d.levels, v) }))}
        />
      </BottomSheetScrollView>
      <View style={{ gap: t.spacing.xs }}>
        <Button
          label={count === 1 ? 'Show 1 exercise' : `Show ${count} exercises`}
          onPress={() => onApply(draft)}
          disabled={count === 0}
          testID="filter-apply"
        />
        <Button
          label="Clear all"
          variant="tertiary"
          onPress={() => setDraft(EMPTY_FILTERS)}
          disabled={activeFilterCount(draft) === 0}
          testID="filter-clear"
        />
      </View>
    </Sheet>
  );
}
