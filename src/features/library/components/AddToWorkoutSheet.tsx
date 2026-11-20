import { router } from 'expo-router';
import { CalendarPlus, Dumbbell } from 'lucide-react-native';
import { View } from 'react-native';

import { trainHref } from '@/features/workout/logic/deepLink';
import { EmptyState, ListRow, Sheet, showToast } from '@/ui';

import { friendlyDate, localISODate } from '../logic/dates';
import { addExerciseToSession, startWorkoutWithExercise, useOpenSessions } from '../repo';

type Props = {
  open: boolean;
  onClose: () => void;
  exerciseId: string;
  exerciseName: string;
};

/**
 * S19 primary action: append this exercise to today's or an upcoming session (local, instant).
 * With nothing planned, the empty state starts a workout with just this exercise instead of
 * being a dead end.
 */
export function AddToWorkoutSheet({ open, onClose, exerciseId, exerciseName }: Props) {
  const today = localISODate();
  const sessions = useOpenSessions(today);
  return (
    <Sheet open={open} onClose={onClose} title="Add to workout" testID="add-sheet">
      {sessions.length ? (
        <View>
          {sessions.map((s, i) => (
            <ListRow
              key={s.id}
              icon={Dumbbell}
              title={s.title ?? 'Workout'}
              subtitle={s.date ? friendlyDate(s.date, today) : undefined}
              divider={i < sessions.length - 1}
              testID={`add-to-${s.id}`}
              onPress={() => {
                addExerciseToSession(s.id, exerciseId);
                // Not a core action: the row ticked on commit, so the toast stays silent.
                showToast({
                  message: `${exerciseName} added to ${s.title ?? 'your workout'}`,
                  tone: 'success',
                  silent: true,
                });
                onClose();
              }}
            />
          ))}
        </View>
      ) : (
        <EmptyState
          icon={CalendarPlus}
          title="No workouts planned yet"
          body="Start one now with this exercise, or add it later from your plan."
          actionLabel="Start a workout with this exercise"
          onAction={() => {
            const s = startWorkoutWithExercise(exerciseId, today);
            onClose();
            router.push(trainHref(s.id));
          }}
          testID="add-sheet-empty"
        />
      )}
    </Sheet>
  );
}
