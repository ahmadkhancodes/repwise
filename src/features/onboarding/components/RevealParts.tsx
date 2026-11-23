import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useTheme, type ColorToken } from '@/theme';
import {
  BigNumber,
  Card,
  ProgressRing,
  ringInnerWidth,
  Text,
  WeekStrip as SharedWeekStrip,
} from '@/ui';

import { MealRow, recipeArt } from '@/features/meals';
import { WorkoutCard as TodayWorkoutCard } from '@/features/today/components/WorkoutCard';

import type { PreviewMeal } from '../hooks/usePlanPreview';
import {
  BUILD_READY,
  type BuildLine as BuildLineModel,
  revealDelay,
  SLOT_LABEL,
  type RevealPart,
  type StripDay,
} from '../logic/reveal';
import { useMotionSafe } from '@/ui/motion';

/** Spring entrance at the reveal choreography's delay for `part` / `index`. */
const useSpringIn = () => {
  const t = useTheme();
  const safe = useMotionSafe();
  // Reduced motion: nothing (a delayed spring could leave a reveal section invisible).
  return (part: RevealPart, index = 0) =>
    safe(
      FadeInDown.delay(revealDelay(t.motion, part, index))
        .springify()
        .damping(t.motion.spring.damping)
        .stiffness(t.motion.spring.stiffness),
    );
};

/** Small macro ring size: one gym hit box plus a spacing step (three fit 320dp). */
const macroRing = (t: ReturnType<typeof useTheme>) => t.sizes.hitGymLarge + t.spacing.md;

/**
 * The build screen's status: one line at a time, cross-fading (the old line fades out where it
 * stood while the new one rises in), with the user's own answer under it. Reduced motion: the
 * lines swap without animation (the screen is short and static then anyway).
 */
export function BuildStatus({
  line,
  index,
  testID,
}: {
  line: BuildLineModel;
  index: number;
  testID?: string;
}) {
  const t = useTheme();
  const safe = useMotionSafe();
  const ready = line.text === BUILD_READY;
  return (
    <View
      testID={testID}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={line.detail ? `${line.text} ${line.detail}` : line.text}
      // Two lines of title2 + callout at 130% font scale, so the ring never jumps between lines.
      style={{ minHeight: t.sizes.touch * 2 + t.spacing.lg, alignItems: 'center' }}
    >
      <Animated.View
        key={index}
        entering={safe(FadeInDown.duration(t.motion.duration.slow))}
        exiting={safe(FadeOut.duration(t.motion.duration.fast))}
        style={{ alignItems: 'center', gap: t.spacing.xs, width: '100%' }}
      >
        <Text
          variant="title2"
          align="center"
          color={ready ? 'accentText' : 'textPrimary'}
          testID={testID ? `${testID}-text` : undefined}
        >
          {line.text}
        </Text>
        {line.detail ? (
          <Animated.View
            entering={safe(FadeIn.delay(t.motion.duration.fast).duration(t.motion.duration.base))}
          >
            <Text variant="callout" color="textSecondary" align="center" numberOfLines={2}>
              {line.detail}
            </Text>
          </Animated.View>
        ) : null}
      </Animated.View>
    </View>
  );
}

/** Hero: today's calories as one huge number in the hero ring, P/C/F rings spring in after. */
export function TargetsHero({
  kcal,
  macros,
  shares,
  dayType,
}: {
  kcal: number;
  macros: { protein: number; carbs: number; fat: number };
  shares: { protein: number; carbs: number; fat: number };
  dayType: string;
}) {
  const t = useTheme();
  const springIn = useSpringIn();
  const ring = t.sizes.ringHero;
  const stroke = t.sizes.ringStroke;
  const small = macroRing(t);
  const smallStroke = t.spacing.xs;
  const rows: { key: 'protein' | 'carbs' | 'fat'; label: string; color: ColorToken }[] = [
    { key: 'protein', label: 'Protein', color: 'macroProtein' },
    { key: 'carbs', label: 'Carbs', color: 'macroCarb' },
    { key: 'fat', label: 'Fat', color: 'macroFat' },
  ];
  return (
    <Animated.View entering={springIn('hero')}>
      <Card
        testID="reveal-targets"
        style={{ alignItems: 'center', gap: t.spacing.lg, paddingVertical: t.spacing.xl }}
      >
        <ProgressRing
          progress={1}
          size={ring}
          strokeWidth={stroke}
          accessibilityLabel={`Calories today, ${kcal} kcal`}
        >
          <BigNumber
            value={kcal}
            variant="hero"
            fitWidth={ringInnerWidth(ring, stroke)}
            center
            testID="reveal-kcal"
          />
          <Text variant="caption" color="textSecondary" align="center">
            {`kcal · ${dayType === 'training' ? 'training day' : 'rest day'}`}
          </Text>
        </ProgressRing>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-around', alignSelf: 'stretch' }}
        >
          {rows.map((r, i) => (
            <Animated.View
              key={r.key}
              entering={springIn('macro', i)}
              style={{ alignItems: 'center', gap: t.spacing.xs }}
            >
              {/* Full rings (P2-9): a target, not "30% done". */}
              <ProgressRing
                progress={1}
                size={small}
                strokeWidth={smallStroke}
                color={r.color}
                accessibilityLabel={`${r.label}, ${Math.round(macros[r.key])} grams`}
              >
                <BigNumber
                  value={Math.round(macros[r.key])}
                  variant="title2"
                  fitWidth={ringInnerWidth(small, smallStroke)}
                  center
                />
              </ProgressRing>
              <Text variant="caption" color="textSecondary">
                {r.label} g
              </Text>
            </Animated.View>
          ))}
        </View>
      </Card>
    </Animated.View>
  );
}

/**
 * The week on the shared WeekStrip (display only): training days ringed, rest days plain, today
 * bold. A line under it names the training days.
 */
export function WeekStrip({ days }: { days: StripDay[] }) {
  const t = useTheme();
  const springIn = useSpringIn();
  const today = days.find((d) => d.isToday)?.date;
  const training = days.filter((d) => d.training);
  return (
    <Animated.View entering={springIn('week')} style={{ gap: t.spacing.xs }} testID="reveal-week">
      <SharedWeekStrip
        days={days.map((d) => ({
          key: d.date,
          weekday: d.label,
          day: d.dayOfMonth,
          status: d.training ? (d.isPast ? 'none' : 'planned') : 'rest',
          accessibilityLabel: `${d.label} ${d.dayOfMonth}${d.isToday ? ', today' : ''}: ${
            d.training ? d.title || 'training' : 'rest'
          }`,
        }))}
        selectedKey={null}
        todayKey={today}
        readOnly
      />
      <Text variant="callout" color="textSecondary" testID="reveal-week-line">
        {training.length
          ? `${training.length} training ${training.length === 1 ? 'day' : 'days'} · ${training
              .map((d) => d.label)
              .join(', ')}`
          : 'Your first sessions start next week.'}
      </Text>
    </Animated.View>
  );
}

/** Uber "your trip" style card for today's session (or the next one on a rest day). */
export function WorkoutCard({
  title,
  minutes,
  count,
  names,
  rest,
}: {
  title: string;
  minutes: number | null;
  count: number;
  names: string[];
  rest?: { label: string; title: string } | null;
}) {
  const t = useTheme();
  const springIn = useSpringIn();
  if (!rest) {
    // Training day: Today's own WorkoutCard in preview (P2-10), so nothing changes shape when the
    // user lands on Today.
    return (
      <Animated.View entering={springIn('workout')}>
        <TodayWorkoutCard
          testID="reveal-workout"
          preview
          workout={{
            sessionId: 'preview',
            title,
            minutes: minutes ?? 0,
            exercises: count,
            muscles: [],
            status: 'planned',
            done: false,
            inProgress: false,
          }}
          detail={
            <View style={{ gap: t.spacing.xxs }}>
              {names.slice(0, 4).map((n, i) => (
                <Animated.View
                  key={`${n}-${i}`}
                  entering={springIn('workout', i + 1)}
                  style={{ flexDirection: 'row', gap: t.spacing.xs }}
                >
                  <Text variant="callout" color="textTertiary" tabular>
                    {i + 1}
                  </Text>
                  <Text variant="callout" numberOfLines={1} style={{ flex: 1 }}>
                    {n}
                  </Text>
                </Animated.View>
              ))}
              {names.length > 4 ? (
                <Text variant="caption" color="textSecondary">
                  +{names.length - 4} more
                </Text>
              ) : null}
            </View>
          }
        />
      </Animated.View>
    );
  }
  return (
    <Animated.View entering={springIn('workout')}>
      <Card testID="reveal-workout" style={{ gap: t.spacing.sm }}>
        <Text variant="eyebrow" color="accentText">
          Today · Rest day
        </Text>
        <Text variant="headline">
          Recover today. Next up: {rest.label} · {rest.title || 'Training'}
        </Text>
      </Card>
    </Animated.View>
  );
}

/**
 * Today's meals slide up from the bottom, one after another — on the shared MealRow in preview
 * (P2-10), the same row Today and Eat use.
 */
export function MealsList({ meals }: { meals: PreviewMeal[] }) {
  const t = useTheme();
  const safe = useMotionSafe();
  return (
    <View style={{ gap: t.spacing.xs }} testID="reveal-meals">
      {meals.map((m, i) => (
        <Animated.View
          key={m.id}
          entering={safe(FadeInUp.delay(revealDelay(t.motion, 'meals', i))
            .springify()
            .damping(t.motion.spring.damping)
            .stiffness(t.motion.spring.stiffness))}
        >
          <MealRow
            preview
            idPrefix="reveal-"
            meal={{
              id: m.id,
              slot: m.slot,
              title: m.title,
              status: 'planned',
              meta: SLOT_LABEL[m.slot] ?? m.slot,
              kcal: m.kcal,
              art: recipeArt({ title: m.title, slot: m.slot }),
            }}
          />
        </Animated.View>
      ))}
    </View>
  );
}

/** Build ring: fills as lines tick. */
export function BuildRing({
  progress,
  children,
}: {
  progress: number;
  children?: React.ReactNode;
}) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(reduceMotion ? 1 : 0.9);
  useEffect(() => {
    if (!reduceMotion) scale.set(withSpring(1, t.motion.spring));
  }, [scale, reduceMotion, t.motion.spring]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[{ alignItems: 'center' }, style]}>
      <ProgressRing
        progress={progress}
        size={t.sizes.ringHero}
        strokeWidth={t.sizes.ringStroke}
        accessibilityLabel="Building your plan"
      >
        {children}
      </ProgressRing>
    </Animated.View>
  );
}
