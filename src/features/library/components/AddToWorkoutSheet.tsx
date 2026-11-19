import { CalendarPlus, Dumbbell } from 'lucide-react-native';
import { View } from 'react-native';

import { haptics } from '@/services/haptics';
import { EmptyState, ListRow, Sheet, showToast } from '@/ui';

import { friendlyDate, localISODate } from '../logic/dates';
import { addExerciseToSession, useOpenSessions } from '../repo';

type Props = {
  open: boolean;
  onClose: () => void;
  exerciseId: string;
  exerciseName: string;
};

/** S19 primary action: append this exercise to today's or an upcoming session (local, instant). */
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
                haptics.success();
                showToast({
                  message: `${exerciseName} added to ${s.title ?? 'your workout'}`,
                  tone: 'success',
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
          body="When your plan has a session today or later, you can add this exercise to it here."
          testID="add-sheet-empty"
        />
      )}
    </Sheet>
  );
}
