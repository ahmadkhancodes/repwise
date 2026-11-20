import { router } from 'expo-router';
import { Image } from 'expo-image';
import { ChevronLeft, ChevronRight, Gift, Share2 } from 'lucide-react-native';
import { useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import {
  ScrollView,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { haptics } from '@/services/haptics';
import { Button, EmptyState, IconButton, Screen, StepProgress, Text, showToast } from '@/ui';
import { useTheme } from '@/theme';

import type { ViewRef } from '../components/CompareSlider';
import { WrappedSkeleton } from '../components/Skeletons';
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
import { storyColors } from '../logic/storyColors';
import { shareViewAsImage } from '../services/shareImage';

const LOGO = require('../../../../assets/images/icon.png');

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
    // No haptic here: sheet 11 never buzzes on scroll.
    if (p !== page) setPage(p);
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
        <WrappedSkeleton />
      ) : empty ? (
        <EmptyState
          icon={Gift}
          title="Nothing to wrap yet"
          body="Train or log meals this month and your story builds itself."
          testID="wrapped-empty"
        />
      ) : (
        <>
          <StepProgress
            total={cards.length}
            current={page}
            accessibilityLabel={`Card ${page + 1} of ${cards.length}`}
            testID="wrapped-progress"
          />
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
                  index={i}
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

function StoryCard({
  kind,
  index,
  wrapped: w,
  active,
  units,
  exerciseName,
}: {
  kind: WrappedCardKind;
  index: number;
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
  const col = storyColors(t.colors, index);
  const ink = { color: col.fg };
  const logo = t.spacing.xl;
  return (
    <View
      testID={`wrapped-card-${kind}`}
      accessible
      accessibilityLabel={[c.kicker, c.big, c.line, c.extra].filter(Boolean).join(', ')}
      style={{
        aspectRatio: 4 / 5,
        borderRadius: t.radius.card + t.spacing.xs,
        backgroundColor: col.bg,
        padding: t.spacing.xl,
        justifyContent: 'space-between',
        overflow: 'hidden',
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: -t.sizes.ring / 2,
          top: -t.sizes.ring / 2,
          width: t.sizes.ringHero,
          height: t.sizes.ringHero,
          borderRadius: t.radius.pill,
          borderWidth: t.spacing.xxl,
          borderColor: col.fg,
          opacity: 0.08,
        }}
      />
      <Text variant="headline" style={ink}>
        {c.kicker}
      </Text>
      <Reveal active={active}>
        <View
          style={{
            width: t.spacing.xxxl,
            height: t.spacing.xxs,
            borderRadius: t.radius.pill,
            backgroundColor: col.fg,
            marginBottom: t.spacing.md,
          }}
        />
        <Text variant="hero" style={ink} adjustsFontSizeToFit numberOfLines={2}>
          {c.big}
        </Text>
        <Text variant="title2" style={[ink, { marginTop: t.spacing.xs }]}>
          {c.line}
        </Text>
        {c.extra ? (
          <Text variant="body" style={[ink, { marginTop: t.spacing.sm }]}>
            {c.extra}
          </Text>
        ) : null}
      </Reveal>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        testID={`wrapped-brand-${kind}`}
      >
        <Image
          source={LOGO}
          style={{ width: logo, height: logo, borderRadius: t.radius.button }}
          accessible={false}
        />
        <Text variant="callout" style={ink}>
          Repwise
        </Text>
      </View>
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
