import { router } from 'expo-router';
import { ChevronLeft, UserRound } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { ChipGroup } from '@/features/onboarding/components/ChipGroup';
import { WeekdayPicker } from '@/features/onboarding/components/WeekdayPicker';
import { presetFor } from '@/features/onboarding/logic/answers';
import {
  EQUIPMENT_OPTIONS,
  GOAL_OPTIONS,
  LOCATION_OPTIONS,
} from '@/features/onboarding/logic/options';
import { SESSION_LENGTHS } from '@/features/onboarding/logic/steps';
import { addDays, startOfWeek, weekdayMon0 } from '@/features/planner/engine';
import type { TrainingPayload } from '@/features/planner/logic/planRows';
import { spreadWeekdays } from '@/features/planner/logic/profile';
import { localToday, regenerateWeek } from '@/features/planner/planService';
import { planForWeek, useLatestPlan } from '@/features/planner/repo';
import { track } from '@/services/analytics';
import { useTheme } from '@/theme';
import { Button, Chip, EmptyState, IconButton, Screen, Segmented, showToast, Text } from '@/ui';

import { draftChanged, draftProblem, locationOf, type PlanDraft } from '../logic/profile';
import { saveProfile, useProfile, type Profile } from '../repo';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.sm }}>
      <Text variant="headline" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function draftFrom(p: Profile, saved: readonly number[] | undefined, today: string): PlanDraft {
  const days = p.days ?? 3;
  return {
    goal: p.goal ?? 'maintain',
    days,
    weekdays:
      saved && saved.length === days ? [...saved] : spreadWeekdays(days, weekdayMon0(today)),
    sessionMin: p.sessionMin ?? 60,
    location: locationOf(p.equipment),
    equipment: [...(p.equipment ?? [])],
  };
}

export type ProfileScreenProps = {
  /** Test seam: the planner call (default: regenerate this week, and next week if planned). */
  replan?: (weekdays: number[]) => Promise<void>;
};

async function replanWeeks(weekdays: number[]): Promise<void> {
  const today = localToday();
  await regenerateWeek({ trainingWeekdays: weekdays });
  const next = addDays(startOfWeek(today), 7);
  if (planForWeek('training', next))
    await regenerateWeek({ date: next, trainingWeekdays: weekdays });
}

/**
 * S38 → Profile & plan: goal, training days, session length and equipment. Saving writes the
 * profile and rebuilds the plan from today (started, swapped and edited sessions are kept).
 */
export function ProfileScreen({ replan = replanWeeks }: ProfileScreenProps) {
  const t = useTheme();
  const profile = useProfile();
  const training = useLatestPlan('training');
  const today = useMemo(() => localToday(), []);
  const savedWeekdays = (training?.payload as TrainingPayload | undefined)?.trainingWeekdays;
  const saved = useMemo(
    () => (profile ? draftFrom(profile, savedWeekdays, today) : null),
    [profile, savedWeekdays, today],
  );
  // Edits sit on top of the saved values (the live profile query resolves after mount).
  const [edits, setEdits] = useState<Partial<PlanDraft>>({});
  const draft: PlanDraft | null = saved ? { ...saved, ...edits } : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const back = () => router.back();
  const header = <IconButton icon={ChevronLeft} accessibilityLabel="Back" onPress={back} />;

  if (!profile || !draft || !saved) {
    return (
      <Screen title="Profile & plan" testID="screen-profile" headerLeft={header}>
        <EmptyState
          icon={UserRound}
          title="No plan yet"
          body="Answer a few questions and we'll build your training and meals."
          actionLabel="Set up my plan"
          onAction={() => router.replace('/welcome')}
          testID="profile-empty"
        />
      </Screen>
    );
  }

  const set = (patch: Partial<PlanDraft>) => {
    setError(null);
    setEdits((e) => ({ ...e, ...patch }));
  };
  const changed = draftChanged(saved, draft);

  const save = async () => {
    const problem = draftProblem(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      saveProfile({
        goal: draft.goal,
        days: draft.days,
        sessionMin: draft.sessionMin,
        equipment: draft.equipment,
        ...(draft.goal === 'maintain' || draft.goal === 'recomp' ? { targetKg: null } : {}),
      });
      await replan(draft.weekdays);
      track('plan_edited', { goal: draft.goal, days: draft.days });
      showToast({ message: 'Plan updated from today.', tone: 'success' });
      router.back();
    } catch {
      setError("Saved, but we couldn't rebuild your plan. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title="Profile & plan"
      testID="screen-profile"
      headerLeft={header}
      footer={
        <View style={{ gap: t.spacing.xs }}>
          {error ? (
            <Text
              variant="callout"
              color="danger"
              align="center"
              accessibilityRole="alert"
              testID="profile-error"
            >
              {error}
            </Text>
          ) : null}
          <Button
            label={changed ? 'Save and update plan' : 'No changes'}
            onPress={() => void save()}
            loading={busy}
            disabled={!changed || busy}
            testID="profile-save"
          />
        </View>
      }
    >
      <Text variant="body" color="textSecondary">
        Changes rebuild your plan from today. Workouts you started, swapped or edited stay as they
        are.
      </Text>

      <Section title="Goal">
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs }}
          accessibilityRole="radiogroup"
        >
          {GOAL_OPTIONS.map((o) => (
            <Chip
              key={o.value}
              role="radio"
              label={o.label}
              selected={draft.goal === o.value}
              onPress={() => set({ goal: o.value })}
              testID={`goal-${o.value}`}
            />
          ))}
        </View>
      </Section>

      <Section title="Training days">
        <Segmented
          options={['2', '3', '4', '5', '6'].map((v) => ({ value: v, label: v }))}
          value={String(draft.days)}
          onChange={(v) => {
            const days = Number(v);
            set({ days, weekdays: spreadWeekdays(days, weekdayMon0(today)) });
          }}
          accessibilityLabel="Days per week"
          testID="profile-days"
        />
        <WeekdayPicker
          selected={draft.weekdays}
          today={weekdayMon0(today)}
          onToggle={(d) =>
            set({
              weekdays: draft.weekdays.includes(d)
                ? draft.weekdays.filter((x) => x !== d)
                : [...draft.weekdays, d].sort((a, b) => a - b),
            })
          }
          testID="profile-weekday"
        />
      </Section>

      <Section title="Session length">
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs }}
          accessibilityRole="radiogroup"
        >
          {SESSION_LENGTHS.map((m) => (
            <Chip
              key={m}
              role="radio"
              label={`${m} min`}
              selected={draft.sessionMin === m}
              onPress={() => set({ sessionMin: m })}
              testID={`length-${m}`}
            />
          ))}
        </View>
      </Section>

      <Section title="Where you train">
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs }}
          accessibilityRole="radiogroup"
        >
          {LOCATION_OPTIONS.map((o) => (
            <Chip
              key={o.value}
              role="radio"
              label={o.label}
              selected={draft.location === o.value}
              onPress={() => set({ location: o.value, equipment: presetFor(o.value) })}
              testID={`location-${o.value}`}
            />
          ))}
        </View>
        {draft.location !== 'bodyweight' ? (
          <ChipGroup
            label="Your equipment"
            options={EQUIPMENT_OPTIONS}
            selected={
              draft.equipment.filter((q) => EQUIPMENT_OPTIONS.some((o) => o.value === q)) as never
            }
            onChange={(picked: string[]) => {
              const hidden = draft.equipment.filter(
                (q) => !EQUIPMENT_OPTIONS.some((o) => o.value === q),
              );
              set({ equipment: [...new Set([...hidden, ...picked, 'bodyweight'])] });
            }}
            testID="profile-equipment"
          />
        ) : null}
      </Section>
    </Screen>
  );
}
