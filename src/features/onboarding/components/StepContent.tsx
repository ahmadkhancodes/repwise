import {
  Armchair,
  Bike,
  Dumbbell,
  Flame,
  Footprints,
  Home,
  Scale,
  Sprout,
  Target,
  TrendingUp,
  User,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { projectGoalDate } from '@/features/planner/logic/goalDate';
import { useTheme } from '@/theme';
import { Card, Segmented, Stepper, Text, WheelPicker } from '@/ui';

import { defaultTarget, presetFor, type Answers } from '../logic/answers';
import {
  fromMinutes,
  mealLabels,
  shiftMealTime,
  toMinutes,
  formatClock,
  defaultMealTimes,
} from '../logic/mealTimes';
import {
  ACTIVITY_OPTIONS,
  ALLERGY_OPTIONS,
  BUDGET_OPTIONS,
  CUISINE_OPTIONS,
  DIET_OPTIONS,
  DISLIKE_OPTIONS,
  EQUIPMENT_OPTIONS,
  EXPERIENCE_OPTIONS,
  GOAL_OPTIONS,
  INJURY_OPTIONS,
  LOCATION_OPTIONS,
  SEX_OPTIONS,
} from '../logic/options';
import { spreadWeekdays } from '@/features/planner/logic/profile';
import { COOK_TIMES, SESSION_LENGTHS, type StepId } from '../logic/steps';
import {
  birthYearItems,
  formatWeight,
  heightItems,
  nearestValue,
  weightItems,
} from '../logic/units';

import { ChipGroup } from './ChipGroup';
import { OptionTile } from './OptionTile';
import { WeekdayPicker } from './WeekdayPicker';

export type StepContentProps = {
  step: StepId;
  answers: Answers;
  set: (patch: Partial<Answers>) => void;
  /** Single-choice tiles call this after setting the answer (auto-advance). */
  onChosen: () => void;
  today: string;
  todayWeekday: number;
  twelveHour: boolean;
};

const GOAL_ICONS: Record<string, LucideIcon> = {
  fat_loss: Flame,
  muscle_gain: Dumbbell,
  recomp: TrendingUp,
  maintain: Target,
};
const ACTIVITY_ICONS: Record<string, LucideIcon> = {
  sedentary: Armchair,
  light: Footprints,
  moderate: Bike,
  active: Zap,
};
const LOCATION_ICONS: Record<string, LucideIcon> = { gym: Dumbbell, home: Home, bodyweight: User };

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.sm }}>
      <Text variant="headline" accessibilityRole="header">
        {label}
      </Text>
      {children}
    </View>
  );
}

/** The controls for one quiz step. Every value is read from and written to the onboarding store. */
export function StepContent({
  step,
  answers: a,
  set,
  onChosen,
  today,
  todayWeekday,
  twelveHour,
}: StepContentProps) {
  const t = useTheme();
  const year = Number(today.slice(0, 4));

  switch (step) {
    case 'goal':
      return (
        <>
          {GOAL_OPTIONS.map((o) => (
            <OptionTile
              key={o.value}
              label={o.label}
              detail={o.detail}
              icon={GOAL_ICONS[o.value]}
              selected={a.goal === o.value}
              onPress={() => {
                set({
                  goal: o.value,
                  ...(o.value === 'maintain' || o.value === 'recomp' ? { targetKg: null } : {}),
                });
                onChosen();
              }}
              testID={`option-${o.value}`}
            />
          ))}
        </>
      );

    case 'about':
      return (
        <>
          <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
            {SEX_OPTIONS.map((o) => (
              <OptionTile
                key={o.value}
                label={o.label}
                selected={a.sex === o.value}
                onPress={() => set({ sex: o.value })}
                style={{ flex: 1 }}
                testID={`option-${o.value}`}
              />
            ))}
          </View>
          <Text variant="caption" color="textSecondary">
            Used for your calorie maths only.
          </Text>
          <Section label="Year of birth">
            <WheelPicker
              items={birthYearItems(year)}
              value={a.birthYear ?? year - 30}
              onChange={(v) => set({ birthYear: v })}
              accessibilityLabel="Year of birth"
              testID="wheel-birth-year"
            />
          </Section>
        </>
      );

    case 'body': {
      const hItems = heightItems(a.units);
      const wItems = weightItems(a.units);
      return (
        <>
          <Segmented
            options={[
              { value: 'metric', label: 'cm · kg' },
              { value: 'imperial', label: 'ft · lb' },
            ]}
            value={a.units}
            onChange={(units) => set({ units })}
            accessibilityLabel="Units"
            testID="units"
          />
          <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
            <View style={{ flex: 1, gap: t.spacing.xs }}>
              <Text variant="caption" color="textSecondary" align="center">
                Height
              </Text>
              <WheelPicker
                key={`h-${a.units}`}
                items={hItems}
                value={nearestValue(hItems, a.heightCm)!}
                onChange={(v) => set({ heightCm: v })}
                accessibilityLabel="Height"
                testID="wheel-height"
              />
            </View>
            <View style={{ flex: 1, gap: t.spacing.xs }}>
              <Text variant="caption" color="textSecondary" align="center">
                Weight
              </Text>
              <WheelPicker
                key={`w-${a.units}`}
                items={wItems}
                value={nearestValue(wItems, a.weightKg)!}
                onChange={(v) => set({ weightKg: v })}
                accessibilityLabel="Weight"
                testID="wheel-weight"
              />
            </View>
          </View>
        </>
      );
    }

    case 'target': {
      const items = weightItems(a.units);
      const goal = a.goal ?? 'fat_loss';
      const projection =
        a.targetKg != null && a.weightKg != null
          ? projectGoalDate({ goal, weightKg: a.weightKg, targetKg: a.targetKg, today })
          : null;
      const fallback = defaultTarget(goal, a.weightKg);
      return (
        <>
          <WheelPicker
            key={`t-${a.units}`}
            items={items}
            value={nearestValue(items, a.targetKg ?? fallback)!}
            onChange={(v) => set({ targetKg: v })}
            accessibilityLabel="Target weight"
            testID="wheel-target"
          />
          {a.targetKg == null ? (
            <Card
              onPress={() => set({ targetKg: nearestValue(items, fallback) ?? null })}
              testID="target-set"
            >
              <Text variant="body" color="textSecondary">
                No target yet. Scroll the wheel or tap here to set one.
              </Text>
            </Card>
          ) : projection ? (
            <Animated.View entering={FadeIn.duration(t.motion.duration.base)}>
              <Card testID="target-projection">
                <View style={{ flexDirection: 'row', gap: t.spacing.sm, alignItems: 'center' }}>
                  <Scale
                    size={t.sizes.icon}
                    strokeWidth={t.sizes.iconStroke}
                    color={t.colors.textPrimary}
                  />
                  <Text variant="body" style={{ flex: 1 }}>
                    At a steady pace you could reach {formatWeight(a.targetKg, a.units)} in about{' '}
                    {projection.weeks} weeks.
                  </Text>
                </View>
              </Card>
            </Animated.View>
          ) : null}
        </>
      );
    }

    case 'experience':
      return (
        <>
          {EXPERIENCE_OPTIONS.map((o) => (
            <OptionTile
              key={o.value}
              label={o.label}
              detail={o.detail}
              icon={o.value === 'beginner' ? Sprout : o.value === 'intermediate' ? TrendingUp : Zap}
              selected={a.experience === o.value}
              onPress={() => {
                set({ experience: o.value });
                onChosen();
              }}
              testID={`option-${o.value}`}
            />
          ))}
        </>
      );

    case 'days': {
      const n = a.daysPerWeek ?? 3;
      return (
        <>
          <Segmented
            options={['2', '3', '4', '5', '6'].map((v) => ({ value: v, label: v }))}
            value={String(n)}
            onChange={(v) => {
              const days = Number(v);
              set({ daysPerWeek: days, trainingWeekdays: spreadWeekdays(days, todayWeekday) });
            }}
            accessibilityLabel="Days per week"
            testID="days-count"
          />
          <Text variant="callout" color="textSecondary" align="center">
            {n} days a week
          </Text>
          <WeekdayPicker
            selected={a.trainingWeekdays}
            today={todayWeekday}
            onToggle={(d) => {
              const on = a.trainingWeekdays.includes(d);
              set({
                trainingWeekdays: on
                  ? a.trainingWeekdays.filter((x) => x !== d)
                  : [...a.trainingWeekdays, d].sort((x, y) => x - y),
              });
            }}
            testID="weekday"
          />
        </>
      );
    }

    case 'length':
      return (
        <>
          {SESSION_LENGTHS.map((m) => (
            <OptionTile
              key={m}
              label={`${m} minutes`}
              detail={m <= 30 ? 'Quick and focused' : m >= 75 ? 'Plenty of volume' : undefined}
              selected={a.sessionMin === m}
              onPress={() => {
                set({ sessionMin: m });
                onChosen();
              }}
              testID={`option-${m}`}
            />
          ))}
        </>
      );

    case 'equipment':
      return (
        <>
          {LOCATION_OPTIONS.map((o) => (
            <OptionTile
              key={o.value}
              label={o.label}
              detail={o.detail}
              icon={LOCATION_ICONS[o.value]}
              selected={a.location === o.value}
              onPress={() => set({ location: o.value, equipment: presetFor(o.value) })}
              testID={`option-${o.value}`}
            />
          ))}
          {a.location && a.location !== 'bodyweight' ? (
            <Animated.View entering={FadeIn.duration(t.motion.duration.base)}>
              <ChipGroup
                label="Your equipment"
                options={EQUIPMENT_OPTIONS}
                selected={a.equipment.filter((q) => EQUIPMENT_OPTIONS.some((o) => o.value === q))}
                onChange={(picked) => {
                  // Keep the kit items without a chip (mat, plates, boxes…) from the preset.
                  const hidden = a.equipment.filter(
                    (q) => !EQUIPMENT_OPTIONS.some((o) => o.value === q),
                  );
                  set({ equipment: [...new Set([...hidden, ...picked, 'bodyweight' as const])] });
                }}
                testID="equipment"
              />
            </Animated.View>
          ) : null}
        </>
      );

    case 'injuries':
      return (
        <ChipGroup
          options={INJURY_OPTIONS}
          selected={a.injuries}
          onChange={(injuries) => set({ injuries })}
          noneLabel="Nothing"
          testID="injuries"
        />
      );

    case 'activity':
      return (
        <>
          {ACTIVITY_OPTIONS.map((o) => (
            <OptionTile
              key={o.value}
              label={o.label}
              detail={o.detail}
              icon={ACTIVITY_ICONS[o.value]}
              selected={a.lifestyle === o.value}
              onPress={() => {
                set({ lifestyle: o.value });
                onChosen();
              }}
              testID={`option-${o.value}`}
            />
          ))}
        </>
      );

    case 'diet':
      return (
        <>
          {DIET_OPTIONS.map((o) => (
            <OptionTile
              key={o.value}
              label={o.label}
              detail={o.detail}
              selected={a.dietType === o.value}
              onPress={() => {
                set({ dietType: o.value });
                onChosen();
              }}
              testID={`option-${o.value}`}
            />
          ))}
        </>
      );

    case 'avoid':
      return (
        <>
          <ChipGroup
            label="Allergies"
            options={ALLERGY_OPTIONS}
            selected={a.allergies}
            onChange={(allergies) => set({ allergies })}
            noneLabel="None"
            testID="allergies"
          />
          <ChipGroup
            label="Foods you dislike"
            options={DISLIKE_OPTIONS}
            selected={a.dislikes}
            onChange={(dislikes) => set({ dislikes })}
            testID="dislikes"
          />
        </>
      );

    case 'cuisines':
      return (
        <ChipGroup
          options={CUISINE_OPTIONS}
          selected={a.cuisines}
          onChange={(cuisines) => set({ cuisines })}
          testID="cuisines"
        />
      );

    case 'kitchen':
      return (
        <>
          <Section label="Budget">
            <Segmented
              options={BUDGET_OPTIONS}
              value={String(a.budget ?? 2) as '1' | '2' | '3'}
              onChange={(v) => set({ budget: Number(v) as 1 | 2 | 3 })}
              accessibilityLabel="Budget"
              testID="budget"
            />
          </Section>
          <Section label="Time to cook">
            <Segmented
              options={COOK_TIMES.map((m) => ({
                value: String(m),
                label: m >= 60 ? '60+' : `${m}`,
              }))}
              value={String(a.cookMin ?? 30)}
              onChange={(v) => set({ cookMin: Number(v) })}
              accessibilityLabel="Minutes to cook"
              testID="cook-time"
            />
            <Text variant="caption" color="textSecondary" align="center">
              Minutes per meal
            </Text>
          </Section>
        </>
      );

    case 'meals': {
      const n = a.mealsPerDay ?? 3;
      const times = a.mealTimes.length === n ? a.mealTimes : defaultMealTimes(n);
      const labels = mealLabels(n);
      return (
        <>
          <Segmented
            options={['2', '3', '4', '5', '6'].map((v) => ({ value: v, label: v }))}
            value={String(n)}
            onChange={(v) =>
              set({ mealsPerDay: Number(v), mealTimes: defaultMealTimes(Number(v)) })
            }
            accessibilityLabel="Meals per day"
            testID="meals-count"
          />
          {times.map((time, i) => (
            <View key={`${n}-${i}`} style={{ gap: t.spacing.xxs }}>
              <Text variant="caption" color="textSecondary">
                {labels[i]}
              </Text>
              <Stepper
                label={`${labels[i]} time`}
                value={toMinutes(time)}
                step={15}
                min={0}
                max={1439}
                format={(m) => formatClock(fromMinutes(m), twelveHour)}
                onChange={(v) => set({ mealTimes: shiftMealTime(times, i, v - toMinutes(time)) })}
                testID={`meal-time-${i}`}
              />
            </View>
          ))}
        </>
      );
    }
  }
}
