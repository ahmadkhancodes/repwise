import { router } from 'expo-router';
import { BarChart3, ChevronLeft, CircleAlert } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Card, Chip, EmptyState, IconButton, Screen, Text } from '@/ui';
import { useTheme } from '@/theme';

import { BarChart } from '../components/BarChart';
import { ProgressSkeleton } from '../components/Skeleton';
import { SectionTitle, Stagger } from '../components/bits';
import { useNutrition, useToday, useTraining } from '../hooks/useProgress';
import { lastDays, lastWeekStarts, shortDate } from '../logic/dates';
import { MUSCLES, type Muscle } from '../logic/engine';
import { muscleLabel, weeklyMuscleVolume } from '../logic/muscles';
import { calorieSummary, dailyCalories, weeklyAdherence } from '../logic/nutrition';

const WEEKS = 8;
const DAYS = 14;

/** Trends: weekly volume per muscle, plan adherence and calories vs target. */
export function TrendsScreen() {
  const t = useTheme();
  const today = useToday();
  const training = useTraining();
  const nutrition = useNutrition();
  const [muscle, setMuscle] = useState<Muscle | 'all'>('all');
  const weeks = useMemo(() => lastWeekStarts(today, WEEKS), [today]);
  const days = useMemo(() => lastDays(today, DAYS), [today]);

  const volume = useMemo(
    () => weeklyMuscleVolume(training.sets, training.exById, weeks),
    [training.sets, training.exById, weeks],
  );
  const trained = useMemo(
    () => MUSCLES.filter((m) => volume.some((w) => w.byMuscle[m] > 0)),
    [volume],
  );
  const volValues = volume.map((w) => (muscle === 'all' ? w.total : w.byMuscle[muscle]));
  const adherence = useMemo(
    () => weeklyAdherence(training.sessions, nutrition.mealPlans, nutrition.meals, weeks, today),
    [training.sessions, nutrition.mealPlans, nutrition.meals, weeks, today],
  );
  const calories = useMemo(
    () => dailyCalories(nutrition.logs, nutrition.mealPlans, days),
    [nutrition.logs, nutrition.mealPlans, days],
  );
  const kcal = calorieSummary(calories);
  const weekLabels = weeks.map(shortDate);
  const back = (
    <IconButton
      icon={ChevronLeft}
      accessibilityLabel="Back"
      onPress={() => router.back()}
      testID="back"
    />
  );
  const loading = training.loading || nutrition.loading;
  const error = training.error ?? nutrition.error;
  const hasAdherence = adherence.some((w) => w.rate != null);
  const lastRate = [...adherence].reverse().find((w) => w.rate != null);

  return (
    <Screen title="Trends" headerLeft={back} testID="screen-progress-trends">
      {loading ? (
        <ProgressSkeleton />
      ) : error ? (
        <EmptyState
          icon={CircleAlert}
          title="Trends didn't load"
          body="Your data is safe on this phone. Try again in a moment."
          testID="trends-error"
        />
      ) : (
        <>
          <Stagger index={0}>
            <SectionTitle title="Weekly volume" />
            <Text variant="callout" color="textSecondary">
              Hard sets per week (a secondary muscle counts half).
            </Text>
          </Stagger>
          {trained.length === 0 ? (
            <Card testID="volume-empty">
              <Text variant="callout" color="textSecondary">
                Finish a workout to see your weekly sets per muscle.
              </Text>
            </Card>
          ) : (
            <View style={{ gap: t.spacing.sm }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs }}>
                <Chip
                  label="All"
                  selected={muscle === 'all'}
                  onPress={() => setMuscle('all')}
                  testID="volume-all"
                />
                {trained.map((m) => (
                  <Chip
                    key={m}
                    label={muscleLabel(m)}
                    selected={muscle === m}
                    onPress={() => setMuscle(m)}
                    testID={`volume-${m}`}
                  />
                ))}
              </View>
              <BarChart
                testID="volume-chart"
                values={volValues}
                labels={weekLabels}
                format={(v) => `${v} sets`}
                accessibilityLabel={`${muscle === 'all' ? 'All muscles' : muscleLabel(muscle)}: ${volValues[volValues.length - 1]} hard sets this week`}
              />
            </View>
          )}

          <Stagger index={1}>
            <SectionTitle title="Adherence" />
            <Text variant="callout" color="textSecondary">
              Planned workouts done and planned meals eaten, per week.
            </Text>
          </Stagger>
          {hasAdherence ? (
            <View style={{ gap: t.spacing.xs }}>
              <BarChart
                testID="adherence-chart"
                values={adherence.map((w) => Math.round((w.rate ?? 0) * 100))}
                labels={weekLabels}
                format={(v) => `${v}%`}
                accessibilityLabel={`Adherence this week ${Math.round((lastRate?.rate ?? 0) * 100)} percent`}
              />
              {lastRate ? (
                <Text variant="caption" color="textSecondary" tabular testID="adherence-detail">
                  {`Week of ${shortDate(lastRate.weekStart)}: ${lastRate.workoutsDone}/${lastRate.workoutsPlanned} workouts · ${lastRate.mealsEaten}/${lastRate.mealsPlanned} meals`}
                </Text>
              ) : null}
            </View>
          ) : (
            <Card testID="adherence-empty">
              <Text variant="callout" color="textSecondary">
                Once you have a plan, this shows how much of it you did each week.
              </Text>
            </Card>
          )}

          <Stagger index={2}>
            <SectionTitle title="Calories" />
            <Text variant="callout" color="textSecondary">
              Logged per day vs your target (the dark line).
            </Text>
          </Stagger>
          {kcal.logged === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="Nothing logged yet"
              body="Tick planned meals or log food and your daily calories show here."
              testID="calories-empty"
            />
          ) : (
            <View style={{ gap: t.spacing.xs }}>
              <BarChart
                testID="calories-chart"
                values={calories.map((d) => d.kcal)}
                targets={calories.map((d) => d.target)}
                labels={calories.map((d) => shortDate(d.date))}
                color="textPrimary"
                highlightLast={false}
                format={(v) => `${v} kcal`}
                accessibilityLabel={`Average ${kcal.avg} kcal on ${kcal.logged} logged days, ${kcal.onTarget} within 10 percent of target`}
              />
              <Text variant="caption" color="textSecondary" tabular testID="calories-summary">
                {`Avg ${kcal.avg} kcal · ${kcal.onTarget} of ${kcal.logged} logged days within 10% of target`}
              </Text>
            </View>
          )}
        </>
      )}
    </Screen>
  );
}
