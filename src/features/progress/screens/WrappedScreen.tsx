import { router } from 'expo-router';
import { ChevronLeft, ChevronRight, Share2, Sparkles } from 'lucide-react-native';
import { useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import {
  ScrollView,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  withSpring,
} from 'react-native-reanimated';

import { haptics } from '@/services/haptics';
import { Button, EmptyState, IconButton, Screen, Text, showToast } from '@/ui';
import { useTheme } from '@/theme';

import type { ViewRef } from '../components/CompareSlider';
import { ProgressSkeleton } from '../components/Skeleton';
import { useNutrition, useToday, useTraining, useUnits } from '../hooks/useProgress';
import { inMonth, monthName, monthOf, sameMonth, shiftMonth, type MonthKey } from '../logic/dates';
import { muscleLabel } from '../logic/muscles';
import { formatLoad, formatWeight } from '../logic/units';
import {
  isEmptyWrapped,
  monthlyWrapped,
  wrappedCards,
  type Wrapped,
  type WrappedCardKind,
} from '../logic/wrapped';
import { shareViewAsImage } from '../services/shareImage';

/** S34 Monthly Wrapped (W8): a swipeable story of the month, every card shareable as an image. */
export function WrappedScreen() {
  const t = useTheme();
  const today = useToday();
  const units = useUnits();
  const training = useTraining();
  const nutrition = useNutrition();
  const { width: screenW } = useWindowDimensions();
  const [month, setMonth] = useState<MonthKey>(() => monthOf(today));
  const [page, setPage] = useState(0);
  const cardRef = useRef<ViewRef>(null);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);

  const wrapped = useMemo(() => {
    const logsInMonth = nutrition.logs.filter((l) => inMonth(l.date, month));
    return monthlyWrapped(
      {
        sessions: training.sessions,
        sets: training.sets,
        exById: training.exById,
        mealsLogged: logsInMonth.length,
        loggedDates: logsInMonth.map((l) => l.date),
        today,
      },
      month,
    );
  }, [training.sessions, training.sets, training.exById, nutrition.logs, month, today]);
  const cards = useMemo(() => wrappedCards(wrapped), [wrapped]);
  const cardW = screenW - t.spacing.screen * 2;
  const isCurrent = sameMonth(month, monthOf(today));

  const changeMonth = (delta: number) => {
    haptics.selection();
    setMonth((m) => shiftMonth(m, delta));
    setPage(0);
    scroller.current?.scrollTo({ x: 0, animated: false });
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const p = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, cardW + t.spacing.sm));
    if (p !== page) {
      haptics.selection();
      setPage(p);
    }
  };
  const share = () =>
    shareViewAsImage(
      cardRef,
      `repwise-wrapped-${month.year}-${month.month}-${cards[page] ?? 'card'}`,
      'wrapped',
    ).catch(() => showToast({ message: "Couldn't share right now." }));

  const back = (
    <IconButton
      icon={ChevronLeft}
      accessibilityLabel="Back"
      onPress={() => router.back()}
      testID="back"
    />
  );
  const loading = training.loading || nutrition.loading;
  const empty = !loading && isEmptyWrapped(wrapped);

  return (
    <Screen
      title="Wrapped"
      headerLeft={back}
      testID="screen-progress-wrapped"
      footer={
        !loading && !empty ? (
          <Button label="Share this card" icon={Share2} onPress={share} testID="wrapped-share" />
        ) : undefined
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton
          icon={ChevronLeft}
          accessibilityLabel="Previous month"
          onPress={() => changeMonth(-1)}
          testID="wrapped-prev"
        />
        <Text
          variant="headline"
          testID="wrapped-month"
        >{`${monthName(month.month)} ${month.year}`}</Text>
        <IconButton
          icon={ChevronRight}
          accessibilityLabel="Next month"
          onPress={() => changeMonth(1)}
          disabled={isCurrent}
          color={isCurrent ? 'textTertiary' : 'textPrimary'}
          testID="wrapped-next"
        />
      </View>
      {loading ? (
        <ProgressSkeleton />
      ) : empty ? (
        <EmptyState
          icon={Sparkles}
          title="Nothing to wrap yet"
          body="Train or log meals this month and your story builds itself."
          testID="wrapped-empty"
        />
      ) : (
        <>
          <StoryBar count={cards.length} index={page} />
          <ScrollView
            ref={scroller}
            horizontal
            pagingEnabled={false}
            snapToInterval={cardW + t.spacing.sm}
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScroll}
            onScrollEndDrag={onScroll}
            contentContainerStyle={{ gap: t.spacing.sm }}
            testID="wrapped-cards"
          >
            {cards.map((kind, i) => (
              <View
                key={kind}
                ref={i === page ? cardRef : undefined}
                collapsable={false}
                style={{ width: cardW }}
              >
                <StoryCard
                  kind={kind}
                  wrapped={wrapped}
                  active={i === page}
                  units={units}
                  exerciseName={training.exerciseName}
                />
              </View>
            ))}
          </ScrollView>
          <Text variant="caption" color="textTertiary" align="center">
            Swipe for the next card
          </Text>
        </>
      )}
    </Screen>
  );
}

function StoryBar({ count, index }: { count: number; index: number }) {
  const t = useTheme();
  return (
    <View
      style={{ flexDirection: 'row', gap: t.spacing.xxs }}
      accessible
      accessibilityLabel={`Card ${index + 1} of ${count}`}
      testID="wrapped-progress"
    >
      {Array.from({ length: count }, (_, i) => (
        <Segment key={i} filled={i <= index} />
      ))}
    </View>
  );
}

function Segment({ filled }: { filled: boolean }) {
  const t = useTheme();
  const reduce = useReducedMotion();
  const style = useAnimatedStyle(() => ({
    opacity: reduce ? (filled ? 1 : 0.25) : withSpring(filled ? 1 : 0.25, t.motion.spring),
  }));
  return (
    <Animated.View
      style={[
        { flex: 1, height: 3, borderRadius: t.radius.pill, backgroundColor: t.colors.textPrimary },
        style,
      ]}
    />
  );
}

function StoryCard({
  kind,
  wrapped: w,
  active,
  units,
  exerciseName,
}: {
  kind: WrappedCardKind;
  wrapped: Wrapped;
  active: boolean;
  units: 'metric' | 'imperial';
  exerciseName: (id: string) => string;
}) {
  const t = useTheme();
  const month = monthName(w.month.month);
  const content: Record<
    WrappedCardKind,
    { kicker: string; big: string; line: string; extra?: string }
  > = {
    intro: {
      kicker: 'Repwise Wrapped',
      big: w.title,
      line: `${w.workouts} workouts · ${w.activeDays} active days`,
    },
    workouts: {
      kicker: 'You showed up',
      big: String(w.workouts),
      line: w.workouts === 1 ? 'workout finished' : 'workouts finished',
      extra: w.minutes > 0 ? `${w.minutes} minutes of training` : undefined,
    },
    volume: {
      kicker: 'Total lifted',
      big: formatLoad(w.volumeKg, units),
      line: `across ${w.sets} hard sets`,
      extra: w.pianos >= 1 ? `About ${w.pianos} grand pianos` : undefined,
    },
    prs: {
      kicker: 'New records',
      big: `${w.prs.length} ${w.prs.length === 1 ? 'PR' : 'PRs'}`,
      line: w.topPr ? `Best: ${exerciseName(w.topPr.exerciseId)}` : 'Personal bests',
      extra: w.topPr
        ? w.topPr.kind === 'weight'
          ? `${formatWeight(w.topPr.valueKg, units)} × ${w.topPr.reps}`
          : `e1RM ${formatWeight(w.topPr.valueKg, units)}`
        : undefined,
    },
    muscle: {
      kicker: 'Led the way',
      big: w.topMuscle ? muscleLabel(w.topMuscle.muscle) : '',
      line: w.topMuscle ? `${w.topMuscle.sets} hard sets` : '',
      extra: w.favouriteExerciseId
        ? `Most-done lift: ${exerciseName(w.favouriteExerciseId)}`
        : undefined,
    },
    streak: {
      kicker: 'Consistency',
      big: `${w.streakWeeks}-week`,
      line: 'streak',
      extra: 'One workout a week keeps it going.',
    },
    food: {
      kicker: 'Fuel',
      big: String(w.mealsLogged),
      line: w.mealsLogged === 1 ? 'meal logged' : 'meals logged',
    },
    summary: {
      kicker: `${month} ${w.month.year}`,
      big: 'That was you.',
      line: [
        `${w.workouts} workouts`,
        w.volumeKg > 0 ? formatLoad(w.volumeKg, units) : null,
        w.prs.length ? `${w.prs.length} PRs` : null,
        w.streakWeeks ? `${w.streakWeeks}-week streak` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    },
  };
  const c = content[kind];
  return (
    <View
      testID={`wrapped-card-${kind}`}
      accessible
      accessibilityLabel={[c.kicker, c.big, c.line, c.extra].filter(Boolean).join(', ')}
      style={{
        aspectRatio: 4 / 5,
        borderRadius: t.radius.card * 2,
        backgroundColor: t.colors.inverse,
        padding: t.spacing.xl,
        justifyContent: 'space-between',
        overflow: 'hidden',
      }}
    >
      <Text variant="callout" color="onInverse" style={{ opacity: 0.7 }}>
        {c.kicker}
      </Text>
      <Reveal active={active}>
        <View
          style={{
            width: t.spacing.xxxl,
            height: 4,
            borderRadius: t.radius.pill,
            backgroundColor: t.colors.accent,
            marginBottom: t.spacing.md,
          }}
        />
        <Text variant="display" color="onInverse" tabular adjustsFontSizeToFit numberOfLines={2}>
          {c.big}
        </Text>
        <Text variant="title2" color="onInverse" style={{ marginTop: t.spacing.xs }}>
          {c.line}
        </Text>
        {c.extra ? (
          <Text variant="body" color="onInverse" style={{ marginTop: t.spacing.sm, opacity: 0.8 }}>
            {c.extra}
          </Text>
        ) : null}
      </Reveal>
      <Text variant="caption" color="onInverse" style={{ opacity: 0.6 }}>
        repwise
      </Text>
    </View>
  );
}

/** Card content springs up each time the card becomes the active one. */
function Reveal({ active, children }: { active: boolean; children: ReactNode }) {
  const t = useTheme();
  return active ? (
    <Animated.View
      entering={FadeInDown.springify()
        .damping(t.motion.spring.damping)
        .stiffness(t.motion.spring.stiffness)}
    >
      {children}
    </Animated.View>
  ) : (
    <View>{children}</View>
  );
}
