import { useLocalSearchParams } from 'expo-router';
import { Utensils } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { saveProfile, useProfile } from '@/features/settings/repo';
import { haptics } from '@/services/haptics';
import { useTheme, type ColorToken } from '@/theme';
import { BigNumber, Button, Card, Chip, EmptyState, Screen, Segmented, Sheet, Text, showToast } from '@/ui';

import { BackButton } from '../components/BackButton';
import { isISODate, todayISO } from '../logic/dates';
import { targetsFor } from '../logic/plan';
import { energyShare } from '../logic/targets';
import { toMealProfile } from '../logic/profile';
import { replanFrom } from '../service';

const DAY_TYPES = [
  { value: 'training', label: 'Training day' },
  { value: 'rest', label: 'Rest day' },
] as const;

const GOALS = [
  { value: 'fat_loss', label: 'Lose fat' },
  { value: 'recomp', label: 'Recomp' },
  { value: 'maintain', label: 'Maintain' },
  { value: 'muscle_gain', label: 'Build muscle' },
] as const;

const ACTIVITY = [
  { value: 'sedentary', label: 'Mostly sitting' },
  { value: 'light', label: 'Lightly active' },
  { value: 'moderate', label: 'On my feet' },
  { value: 'active', label: 'Very active' },
] as const;

const MACROS: { key: 'protein' | 'carbs' | 'fat'; label: string; color: ColorToken }[] = [
  { key: 'protein', label: 'Protein', color: 'macroProtein' },
  { key: 'carbs', label: 'Carbs', color: 'macroCarb' },
  { key: 'fat', label: 'Fat', color: 'macroFat' },
];

/** S20 Nutrition targets: kcal, macros and day types from the engine; Edit goal and activity. */
export function TargetsScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ date?: string }>();
  const date = isISODate(params.date) ? params.date : todayISO();
  const row = useProfile();
  const profile = useMemo(() => toMealProfile(row), [row]);
  const targets = useMemo(() => (profile ? targetsFor(profile.engine, date) : null), [profile, date]);
  const [dayType, setDayType] = useState<'training' | 'rest'>('training');
  const [editing, setEditing] = useState(false);
  const [goal, setGoal] = useState<string>(row?.goal ?? 'maintain');
  const [activity, setActivity] = useState<string>(row?.activityLevel ?? 'light');

  if (!profile || !targets) {
    return (
      <Screen title="Targets" headerLeft={<BackButton />} testID="screen-targets">
        <EmptyState
          icon={Utensils}
          title="No targets yet"
          body="Your calories and macros are worked out from your profile once setup is done."
          testID="targets-empty"
        />
      </Screen>
    );
  }

  const set = targets[dayType];
  const share = energyShare(set);

  const save = () => {
    saveProfile({ goal, activityLevel: activity });
    const res = replanFrom(todayISO());
    haptics.success();
    setEditing(false);
    showToast({
      message: res.status === 'ready' && res.created > 0 ? 'Targets updated. Meals re-planned from today.' : 'Targets updated',
      tone: 'success',
    });
  };

  return (
    <Screen
      title="Targets"
      headerLeft={<BackButton />}
      testID="screen-targets"
      footer={<Button label="Edit goal and activity" onPress={() => setEditing(true)} testID="targets-edit" />}
    >
      <Segmented options={DAY_TYPES} value={dayType} onChange={setDayType} accessibilityLabel="Day type" testID="targets-daytype" />
      <Card>
        <BigNumber value={set.kcal} unit="kcal" label={dayType === 'training' ? 'Training days' : 'Rest days'} testID="targets-kcal" />
        <Text variant="callout" color="textSecondary">
          {dayType === 'training' ? 'A little more carbs on days you train.' : 'A little fewer carbs on rest days.'}
        </Text>
      </Card>
      <View style={{ gap: t.spacing.sm }}>
        {MACROS.map((m) => {
          const g = set[m.key];
          const pct = share[m.key];
          return (
            <Card key={m.key} testID={`targets-${m.key}`}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text variant="headline" style={{ flex: 1 }}>
                  {m.label}
                </Text>
                <Text variant="title2" tabular>
                  {Math.round(g)} g
                </Text>
              </View>
              <View
                style={{ height: t.spacing.xs, borderRadius: t.radius.pill, backgroundColor: t.colors.surface2, marginTop: t.spacing.xs, overflow: 'hidden' }}
                accessibilityLabel={`${pct}% of calories`}
              >
                <View style={{ width: `${Math.min(100, pct)}%`, height: '100%', backgroundColor: t.colors[m.color], borderRadius: t.radius.pill }} />
              </View>
              <Text variant="caption" color="textSecondary" tabular style={{ marginTop: t.spacing.xxs }}>
                {pct}% of calories
              </Text>
            </Card>
          );
        })}
      </View>
      <Card>
        <Text variant="headline">How we got here</Text>
        <Text variant="callout" color="textSecondary" tabular>
          Resting energy about {Math.round(targets.bmr).toLocaleString('en-US')} kcal · maintenance about{' '}
          {Math.round(targets.tdee).toLocaleString('en-US')} kcal. Your goal and activity set the rest. Weekly check-ins fine-tune it.
        </Text>
        {targets.consultProfessional ? (
          <Text variant="callout" color="textSecondary" testID="targets-safety">
            We have set a steady maintenance plan for you. For changes in body weight, talk to a qualified health professional.
          </Text>
        ) : null}
      </Card>

      <Sheet open={editing} onClose={() => setEditing(false)} title="Edit targets" testID="targets-sheet">
        <Text variant="callout" color="textSecondary">
          Goal
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs }}>
          {GOALS.map((g) => (
            <Chip key={g.value} label={g.label} selected={goal === g.value} onPress={() => setGoal(g.value)} testID={`goal-${g.value}`} />
          ))}
        </View>
        <Text variant="callout" color="textSecondary">
          Day-to-day activity
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs }}>
          {ACTIVITY.map((a) => (
            <Chip key={a.value} label={a.label} selected={activity === a.value} onPress={() => setActivity(a.value)} testID={`activity-${a.value}`} />
          ))}
        </View>
        <Button label="Save" onPress={save} testID="targets-save" />
      </Sheet>
    </Screen>
  );
}
