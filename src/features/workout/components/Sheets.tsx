import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Dumbbell,
  Repeat,
  Trash2,
  type LucideIcon,
} from 'lucide-react-native';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Button, Card, Chip, EmptyState, IconButton, ListRow, Sheet, Text } from '@/ui';

import type { ExerciseMeta } from '../exerciseMeta';
import { RPE_OPTIONS, SET_TYPES, spokenSetName } from '../logic/sets';
import { trimNumber } from '../logic/units';
import type { SetType } from '@/db/schema';
import type { WorkoutSet } from '../repo';

/** Set type + RPE (RW-21) for one set; delete lives here too. */
export function SetSheet({
  set,
  label,
  cardio,
  onClose,
  onType,
  onRpe,
  onDelete,
}: {
  set: WorkoutSet | null;
  label: string;
  cardio: boolean;
  onClose: () => void;
  onType: (type: SetType) => void;
  onRpe: (rpe: number | null) => void;
  onDelete: () => void;
}) {
  const t = useTheme();
  return (
    <Sheet
      open={set !== null}
      onClose={onClose}
      title={set ? spokenSetName(set.type, label) : 'Set'}
      testID="set-sheet"
    >
      {set ? (
        <View style={{ gap: t.spacing.md }}>
          {cardio ? null : (
            <>
              <Text variant="callout" color="textSecondary">
                Set type
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs }}>
                {SET_TYPES.map((st) => (
                  <Chip
                    key={st.value}
                    label={st.label}
                    role="radio"
                    selected={set.type === st.value}
                    onPress={() => onType(st.value)}
                    testID={`set-type-${st.value}`}
                  />
                ))}
              </View>
              <Text variant="callout" color="textSecondary">
                RPE (how hard, 10 = nothing left)
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs }}>
                <Chip
                  label="None"
                  role="radio"
                  selected={set.rpe == null}
                  onPress={() => onRpe(null)}
                  testID="rpe-none"
                />
                {RPE_OPTIONS.map((r) => (
                  <Chip
                    key={r}
                    label={trimNumber(r)}
                    role="radio"
                    selected={set.rpe === r}
                    onPress={() => onRpe(r)}
                    testID={`rpe-${r}`}
                  />
                ))}
              </View>
            </>
          )}
          <Button
            label="Delete set"
            icon={Trash2}
            variant="destructive"
            onPress={onDelete}
            testID="set-delete"
          />
        </View>
      ) : null}
    </Sheet>
  );
}

/** Swap (S15, W4): three smart alternatives, one tap to pick. */
export function SwapSheet({
  open,
  current,
  options,
  locked,
  onClose,
  onPick,
}: {
  open: boolean;
  current: ExerciseMeta | null;
  options: ExerciseMeta[];
  /** Some sets are already logged: those stay; only the rest move to the new exercise. */
  locked: boolean;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const t = useTheme();
  return (
    <Sheet open={open} onClose={onClose} title="Swap exercise" testID="swap-sheet">
      {current ? (
        <View style={{ gap: t.spacing.sm }}>
          <Text variant="callout" color="textSecondary">
            Instead of {current.name} — same movement, with your equipment.
            {locked ? ' Sets you already logged stay as they are.' : ''}
          </Text>
          {options.length === 0 ? (
            <EmptyState
              icon={Repeat}
              title="No alternatives right now"
              body="Nothing else fits your equipment and recent sessions. Try adding an exercise instead."
              testID="swap-empty"
            />
          ) : (
            options.map((o, i) => (
              <Card
                key={o.id}
                onPress={() => onPick(o.id)}
                accessibilityLabel={`Swap to ${o.name}`}
                testID={`swap-option-${i}`}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                  <Dumbbell
                    color={t.colors.textSecondary}
                    size={t.sizes.icon}
                    strokeWidth={t.sizes.iconStroke}
                  />
                  <View style={{ flex: 1 }}>
                    <Text variant="headline">{o.name}</Text>
                    <Text variant="caption" color="textSecondary" numberOfLines={1}>
                      {[
                        o.primaryMuscles.join(', '),
                        o.equipment.map((e) => e.replace(/_/g, ' ')).join(', '),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                </View>
              </Card>
            ))
          )}
        </View>
      ) : null}
    </Sheet>
  );
}

type MenuAction = {
  key: string;
  label: string;
  icon: LucideIcon;
  destructive?: boolean;
  onPress: () => void;
};

export type { MenuAction };

/** The "…" menu of an exercise card, and the workout's overflow menu. */
export function ExerciseMenuSheet({
  open,
  title,
  actions,
  onClose,
  testID = 'exercise-menu',
}: {
  open: boolean;
  title: string;
  actions: MenuAction[];
  onClose: () => void;
  testID?: string;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title} testID={testID}>
      {open ? (
        <View>
          {actions.map((a, i) => (
            <ListRow
              key={a.key}
              title={a.label}
              icon={a.icon}
              destructive={a.destructive}
              onPress={a.onPress}
              divider={i < actions.length - 1}
              testID={`menu-${a.key}`}
            />
          ))}
        </View>
      ) : null}
    </Sheet>
  );
}

/** Reorder (RW-26): move exercises up/down; accessible on both platforms (no drag precision needed). */
export function ReorderSheet({
  open,
  items,
  onMove,
  onClose,
}: {
  open: boolean;
  items: { id: string; name: string }[];
  onMove: (from: number, to: number) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Reorder"
      scrollable
      footer={<Button label="Done" onPress={onClose} testID="reorder-done" />}
      testID="reorder-sheet"
    >
      {open ? (
        <View>
          {items.map((it, i) => (
            <View
              key={it.id}
              testID={`reorder-row-${i}`}
              accessible
              accessibilityLabel={`${it.name}, position ${i + 1} of ${items.length}`}
              accessibilityActions={[
                { name: 'moveUp', label: 'Move up' },
                { name: 'moveDown', label: 'Move down' },
              ]}
              onAccessibilityAction={(e) =>
                e.nativeEvent.actionName === 'moveUp' ? onMove(i, i - 1) : onMove(i, i + 1)
              }
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                minHeight: t.sizes.row,
                gap: t.spacing.xs,
                borderBottomWidth: i < items.length - 1 ? t.sizes.hairline : 0,
                borderBottomColor: t.colors.border,
              }}
            >
              <ArrowUpDown
                color={t.colors.textTertiary}
                size={t.sizes.iconSmall}
                strokeWidth={t.sizes.iconStroke}
              />
              <Text variant="body" style={{ flex: 1 }} numberOfLines={2}>
                {it.name}
              </Text>
              <IconButton
                icon={ArrowUp}
                accessibilityLabel={`Move ${it.name} up`}
                disabled={i === 0}
                feedback="selection"
                onPress={() => onMove(i, i - 1)}
                testID={`reorder-up-${i}`}
              />
              <IconButton
                icon={ArrowDown}
                accessibilityLabel={`Move ${it.name} down`}
                disabled={i === items.length - 1}
                feedback="selection"
                onPress={() => onMove(i, i + 1)}
                testID={`reorder-down-${i}`}
              />
            </View>
          ))}
        </View>
      ) : null}
    </Sheet>
  );
}
