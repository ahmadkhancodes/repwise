import { Check, Dumbbell, Moon } from 'lucide-react-native';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useTheme, type ColorToken } from '@/theme';
import { BigNumber, Card, ProgressRing, Text } from '@/ui';

import type { PreviewMeal } from '../hooks/usePlanPreview';
import { SLOT_LABEL, type StripDay } from '../logic/reveal';

const useSpringIn = () => {
  const t = useTheme();
  return (delay: number) =>
    FadeInDown.delay(delay)
      .springify()
      .damping(t.motion.spring.damping)
      .stiffness(t.motion.spring.stiffness);
};

/** One line of the build sequence: a pulsing dot while working, a check when done. */
export function BuildLine({
  label,
  state,
  testID,
}: {
  label: string;
  state: 'todo' | 'active' | 'done';
  testID?: string;
}) {
  const t = useTheme();
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (state === 'active' && !reduceMotion) {
      pulse.set(
        withRepeat(
          withSequence(withTiming(0.35, { duration: 420 }), withTiming(1, { duration: 420 })),
          -1,
        ),
      );
    } else {
      pulse.set(1);
    }
  }, [state, pulse, reduceMotion]);
  const dot = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const done = state === 'done';
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`${label}${done ? ', done' : state === 'active' ? ', in progress' : ''}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.sm,
        minHeight: t.sizes.touch - t.spacing.xs,
      }}
    >
      <Animated.View
        style={[
          {
            width: t.sizes.icon,
            height: t.sizes.icon,
            borderRadius: t.radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: done
              ? t.colors.accent
              : state === 'active'
                ? t.colors.textPrimary
                : t.colors.surface2,
          },
          state === 'active' ? dot : null,
        ]}
      >
        {done ? (
          <Animated.View entering={FadeIn.duration(t.motion.duration.fast)}>
            <Check
              size={t.sizes.iconSmall}
              strokeWidth={t.sizes.iconStroke + 1}
              color={t.colors.onAccent}
            />
          </Animated.View>
        ) : null}
      </Animated.View>
      <Text
        variant="body"
        color={state === 'todo' ? 'textTertiary' : 'textPrimary'}
        style={{ flex: 1 }}
      >
        {label}
      </Text>
    </View>
  );
}

/** Hero: today's calories in a big ring with P/C/F rings that fill one after another. */
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
  const ring = t.sizes.ring * 1.5;
  const small = t.sizes.ring / 2;
  const rows: { key: 'protein' | 'carbs' | 'fat'; label: string; color: ColorToken }[] = [
    { key: 'protein', label: 'Protein', color: 'macroProtein' },
    { key: 'carbs', label: 'Carbs', color: 'macroCarb' },
    { key: 'fat', label: 'Fat', color: 'macroFat' },
  ];
  return (
    <Animated.View entering={springIn(0)}>
      <Card
        testID="reveal-targets"
        style={{ alignItems: 'center', gap: t.spacing.lg, paddingVertical: t.spacing.xl }}
      >
        <ProgressRing
          progress={1}
          size={ring}
          strokeWidth={t.sizes.ringStroke + 4}
          accessibilityLabel={`Calories today, ${kcal} kcal`}
        >
          <BigNumber value={kcal} testID="reveal-kcal" />
          <Text variant="caption" color="textSecondary">
            kcal · {dayType === 'training' ? 'training day' : 'rest day'}
          </Text>
        </ProgressRing>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-around', alignSelf: 'stretch' }}
        >
          {rows.map((r, i) => (
            <Animated.View
              key={r.key}
              entering={springIn(300 + i * 140)}
              style={{ alignItems: 'center', gap: t.spacing.xs }}
            >
              <ProgressRing
                progress={shares[r.key]}
                size={small}
                strokeWidth={t.sizes.ringStroke - 2}
                color={r.color}
                accessibilityLabel={`${r.label}, ${Math.round(macros[r.key])} grams`}
              >
                <Text variant="headline" tabular>
                  {Math.round(macros[r.key])}
                </Text>
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

/** Week strip: the seven days drop in one after another; training days are filled. */
export function WeekStrip({ days }: { days: StripDay[] }) {
  const t = useTheme();
  const springIn = useSpringIn();
  return (
    <View style={{ flexDirection: 'row', gap: t.spacing.xxs }} testID="reveal-week">
      {days.map((d, i) => (
        <Animated.View
          key={d.date}
          entering={springIn(500 + i * 70)}
          style={{ flex: 1 }}
          accessible
          accessibilityLabel={`${d.label} ${d.dayOfMonth}${d.isToday ? ', today' : ''}: ${d.training ? d.title || 'training' : 'rest'}`}
          testID={`reveal-day-${i}`}
        >
          <View
            style={{
              alignItems: 'center',
              gap: t.spacing.xxs,
              paddingVertical: t.spacing.sm,
              borderRadius: t.radius.card,
              backgroundColor: d.training ? t.colors.inverse : t.colors.surface,
              borderWidth: t.sizes.hairline * 2,
              borderColor: d.isToday ? t.colors.accent : 'transparent',
              opacity: d.isPast ? 0.4 : 1,
            }}
          >
            <Text
              variant="caption"
              style={{ color: d.training ? t.colors.onInverse : t.colors.textSecondary }}
            >
              {d.label.slice(0, 1)}
            </Text>
            <Text
              variant="headline"
              tabular
              style={{ color: d.training ? t.colors.onInverse : t.colors.textPrimary }}
            >
              {d.dayOfMonth}
            </Text>
            {d.training ? (
              <Dumbbell
                size={t.sizes.iconSmall}
                strokeWidth={t.sizes.iconStroke}
                color={t.colors.onInverse}
              />
            ) : (
              <Moon
                size={t.sizes.iconSmall}
                strokeWidth={t.sizes.iconStroke}
                color={t.colors.textTertiary}
              />
            )}
          </View>
        </Animated.View>
      ))}
    </View>
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
  return (
    <Animated.View entering={springIn(1000)}>
      <Card testID="reveal-workout" style={{ gap: t.spacing.sm }}>
        <Text variant="caption" color="accentText">
          {rest ? 'TODAY · REST DAY' : 'TODAY'}
        </Text>
        {rest ? (
          <Text variant="headline">
            Recover today. Next up: {rest.label} · {rest.title || 'Training'}
          </Text>
        ) : (
          <>
            <Text variant="title2">{title}</Text>
            <Text variant="callout" color="textSecondary" tabular>
              {minutes ? `${minutes} min · ` : ''}
              {count} exercises
            </Text>
            <View style={{ gap: t.spacing.xxs }}>
              {names.slice(0, 4).map((n, i) => (
                <Animated.View
                  key={`${n}-${i}`}
                  entering={springIn(1150 + i * 80)}
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
          </>
        )}
      </Card>
    </Animated.View>
  );
}

/** Today's meals slide up from the bottom, one after another. */
export function MealsList({ meals }: { meals: PreviewMeal[] }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.xs }} testID="reveal-meals">
      {meals.map((m, i) => (
        <Animated.View
          key={m.id}
          entering={FadeInUp.delay(1400 + i * 110)
            .springify()
            .damping(t.motion.spring.damping)
            .stiffness(t.motion.spring.stiffness)}
        >
          <View
            accessible
            accessibilityLabel={`${SLOT_LABEL[m.slot] ?? m.slot}: ${m.title}, ${m.kcal} kcal`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.sm,
              minHeight: t.sizes.row,
              paddingHorizontal: t.spacing.md,
              paddingVertical: t.spacing.sm,
              backgroundColor: t.colors.surface,
              borderRadius: t.radius.card,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text variant="caption" color="textSecondary">
                {SLOT_LABEL[m.slot] ?? m.slot}
              </Text>
              <Text variant="callout" numberOfLines={2}>
                {m.title}
              </Text>
            </View>
            <Text variant="callout" tabular>
              {m.kcal} kcal
            </Text>
          </View>
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
        size={t.sizes.ring * 1.5}
        strokeWidth={t.sizes.ringStroke + 4}
        accessibilityLabel="Building your plan"
      >
        {children}
      </ProgressRing>
    </Animated.View>
  );
}
