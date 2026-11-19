import { router } from 'expo-router';
import { ChevronLeft, CircleAlert, Dumbbell, Trophy } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { EmptyState, IconButton, ListRow, Screen, Segmented } from '@/ui';
import { useTheme } from '@/theme';

import { ProgressSkeleton } from '../components/Skeleton';
import { Stagger } from '../components/bits';
import { useTraining, useUnits } from '../hooks/useProgress';
import { shortDate } from '../logic/dates';
import { personalRecords, trainedExercises } from '../logic/strength';
import { formatWeight } from '../logic/units';

type Tab = 'exercises' | 'prs';

/** S31 index: every trained exercise (best e1RM, trend) and the full PR list. */
export function RecordsScreen() {
  const t = useTheme();
  const units = useUnits();
  const training = useTraining();
  const [tab, setTab] = useState<Tab>('exercises');
  const list = useMemo(() => trainedExercises(training.sets), [training.sets]);
  const prs = useMemo(() => personalRecords(training.sets), [training.sets]);
  const back = (
    <IconButton
      icon={ChevronLeft}
      accessibilityLabel="Back"
      onPress={() => router.back()}
      testID="back"
    />
  );

  return (
    <Screen title="Strength" headerLeft={back} testID="screen-progress-records">
      <Segmented
        testID="records-tab"
        accessibilityLabel="Show"
        options={[
          { value: 'exercises', label: 'Exercises' },
          { value: 'prs', label: `PRs${prs.length ? ` · ${prs.length}` : ''}` },
        ]}
        value={tab}
        onChange={setTab}
      />
      {training.loading ? (
        <ProgressSkeleton />
      ) : training.error ? (
        <EmptyState
          icon={CircleAlert}
          title="Couldn't load your workouts"
          body="Your data is safe on this phone. Try again in a moment."
          testID="records-error"
        />
      ) : tab === 'exercises' ? (
        list.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title="No lifts logged yet"
            body="Tick a few sets in a workout and your strength curves start here."
            testID="records-empty"
          />
        ) : (
          <View>
            {list.map((e, i) => (
              <Stagger key={e.exerciseId} index={i}>
                <ListRow
                  title={training.exerciseName(e.exerciseId)}
                  subtitle={`${e.sessions} ${e.sessions === 1 ? 'session' : 'sessions'} · last ${shortDate(e.lastDate)}`}
                  value={e.bestE1rm != null ? `${formatWeight(e.bestE1rm, units)}` : undefined}
                  chevron
                  divider={i < list.length - 1}
                  onPress={() => router.push(`/progress/exercise/${e.exerciseId}`)}
                  testID={`exercise-${e.exerciseId}`}
                />
              </Stagger>
            ))}
          </View>
        )
      ) : prs.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No PRs yet"
          body="Beat your best weight or estimated 1RM on any lift and it lands here."
          testID="prs-empty"
        />
      ) : (
        <View style={{ gap: t.spacing.xxs }}>
          {prs.map((p, i) => (
            <Stagger key={`${p.exerciseId}-${p.sessionId}`} index={i}>
              <ListRow
                icon={Trophy}
                title={training.exerciseName(p.exerciseId)}
                subtitle={`${shortDate(p.date)} · beat ${formatWeight(p.previousKg, units)}`}
                value={
                  p.kind === 'weight'
                    ? `${formatWeight(p.valueKg, units)} × ${p.reps}`
                    : `e1RM ${formatWeight(p.valueKg, units)}`
                }
                divider={i < prs.length - 1}
                onPress={() => router.push(`/progress/exercise/${p.exerciseId}`)}
                testID={`pr-row-${i}`}
              />
            </Stagger>
          ))}
        </View>
      )}
    </Screen>
  );
}
