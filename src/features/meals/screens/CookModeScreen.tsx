import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { CircleAlert, ListChecks, Pause, Play, RotateCcw, Timer, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInLeft, FadeInRight, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptics } from '@/services/haptics';
import { useCatalogFor } from '@/services/catalog';
import { useTheme } from '@/theme';
import {
  Button,
  EmptyState,
  IconButton,
  PressableScale,
  Sheet,
  Skeleton,
  SkeletonGroup,
  SkeletonText,
  StepProgress,
  Text,
  showToast,
} from '@/ui';

import { formatClock, parseStepTimer, remainingSeconds } from '../logic/cook';
import { formatGrams, formatServings, scaledIngredients } from '../logic/recipe';
import { markMealEaten } from '../service';

type TimerState = { endsAt: number | null; left: number; total: number; done: boolean };

/**
 * S24 cook mode (wow moment): one big step at a time, the screen stays awake, a trip-style
 * progress bar, and a timer on every step that mentions a time. Timers keep running when you
 * move between steps; finishing one buzzes (success haptic) and shows a toast.
 */
export function CookModeScreen() {
  useKeepAwake();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const reduce = useReducedMotion();
  const params = useLocalSearchParams<{ id: string; servings?: string; mealId?: string }>();
  const cat = useCatalogFor('recipes', 'foods');
  const recipe = cat?.recipeById.get(String(params.id));
  const servings = Number(params.servings) > 0 ? Number(params.servings) : 1;
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [timers, setTimers] = useState<Record<number, TimerState>>({});
  const [now, setNow] = useState(() => Date.now());
  const [showIngredients, setShowIngredients] = useState(false);
  const announced = useRef(new Set<number>());

  const stepTimers = useMemo(() => (recipe ? recipe.steps.map(parseStepTimer) : []), [recipe]);
  const running = Object.values(timers).some((x) => x.endsAt !== null);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);

  // Finish timers whose end time has passed (wherever the user is in the recipe).
  useEffect(() => {
    for (const [k, v] of Object.entries(timers)) {
      const i = Number(k);
      if (v.endsAt !== null && remainingSeconds(v.endsAt, now) === 0 && !announced.current.has(i)) {
        announced.current.add(i);
        haptics.success();
        showToast({ message: `Step ${i + 1} timer is done`, tone: 'success', silent: true });
        setTimers((s) => ({ ...s, [i]: { ...v, endsAt: null, left: 0, done: true } }));
      }
    }
  }, [now, timers]);

  if (!recipe || !cat) {
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg, paddingTop: insets.top }} testID="screen-cook">
        <Stack.Screen options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
        {cat ? (
          <EmptyState
            icon={CircleAlert}
            title="Recipe not found"
            body="It may have been removed from the catalogue."
            actionLabel="Close"
            onAction={() => router.back()}
            testID="cook-missing"
          />
        ) : (
          <SkeletonGroup label="Loading recipe" testID="cook-loading" style={{ padding: t.spacing.screen, gap: t.spacing.lg }}>
            <Skeleton height={t.spacing.xxs} radius={t.radius.pill} />
            <SkeletonText variant="title2" lines={3} lastLineWidth="55%" />
            <Skeleton height={t.sizes.ring} radius={t.radius.card} />
          </SkeletonGroup>
        )}
      </View>
    );
  }

  const n = recipe.steps.length;
  const last = step === n - 1;
  const timer = stepTimers[step];
  const state = timers[step];
  const left = state ? (state.endsAt !== null ? remainingSeconds(state.endsAt, now) : state.left) : (timer?.seconds ?? 0);

  const go = (to: number) => {
    if (to < 0 || to >= n) return;
    setDir(to > step ? 1 : -1);
    setStep(to);
  };

  const startPause = () => {
    if (!timer) return;
    setTimers((s) => {
      const cur = s[step];
      if (cur?.endsAt != null) {
        return { ...s, [step]: { ...cur, endsAt: null, left: remainingSeconds(cur.endsAt, Date.now()) } };
      }
      const from = cur && !cur.done && cur.left > 0 ? cur.left : timer.seconds;
      announced.current.delete(step);
      return { ...s, [step]: { endsAt: Date.now() + from * 1000, left: from, total: timer.seconds, done: false } };
    });
    setNow(Date.now());
  };

  const reset = () => {
    announced.current.delete(step);
    setTimers((s) => {
      const next = { ...s };
      delete next[step];
      return next;
    });
  };

  const finish = () => {
    if (params.mealId) {
      // Core action: the success toast owns the one success buzz.
      markMealEaten(String(params.mealId));
      showToast({ message: `Enjoy! ${recipe.title} is logged.`, tone: 'success' });
    } else {
      haptics.success();
    }
    router.back();
  };

  const otherRunning = Object.entries(timers).filter(([k, v]) => Number(k) !== step && v.endsAt !== null);
  const isRunning = state?.endsAt != null;

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg, paddingTop: insets.top }} testID="screen-cook">
      <Stack.Screen options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.spacing.xs }}>
        <IconButton icon={X} accessibilityLabel="Close cook mode" onPress={() => router.back()} testID="cook-close" />
        <Text variant="callout" color="textSecondary" style={{ flex: 1 }} align="center" numberOfLines={1}>
          {recipe.title}
        </Text>
        <IconButton icon={ListChecks} accessibilityLabel="Ingredients" onPress={() => setShowIngredients(true)} testID="cook-ingredients" />
      </View>

      {/* Trip-style segmented progress */}
      <View style={{ paddingHorizontal: t.spacing.screen, marginTop: t.spacing.xs }}>
        <StepProgress
          total={n}
          current={step}
          color="accent"
          accessibilityLabel={`Step ${step + 1} of ${n}`}
          testID="cook-progress"
        />
      </View>

      <ScrollView contentContainerStyle={{ padding: t.spacing.screen, gap: t.spacing.lg, flexGrow: 1 }}>
        <Text variant="callout" color="accentText" testID="cook-step-count">
          Step {step + 1} of {n}
        </Text>
        <Animated.View key={step} entering={reduce ? undefined : (dir > 0 ? FadeInRight : FadeInLeft).springify().damping(t.motion.spring.damping).stiffness(t.motion.spring.stiffness)}>
          <Text variant="title2" testID="cook-step">
            {recipe.steps[step]}
          </Text>
        </Animated.View>

        {timer ? (
          <View
            testID="cook-timer"
            style={{ backgroundColor: t.colors.surface, borderRadius: t.radius.card, padding: t.spacing.lg, alignItems: 'center', gap: t.spacing.sm }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}>
              <Timer color={t.colors.textSecondary} size={t.sizes.iconSmall} strokeWidth={t.sizes.iconStroke} />
              <Text variant="caption" color="textSecondary">
                {state?.done ? 'Done' : `Timer · ${timer.label}`}
              </Text>
            </View>
            <Text
              variant="display"
              tabular
              color={state?.done ? 'accentText' : 'textPrimary'}
              accessibilityLabel={`${Math.floor(left / 60)} minutes ${left % 60} seconds left`}
              accessibilityLiveRegion="polite"
              testID="cook-clock"
            >
              {formatClock(left)}
            </Text>
            <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
              <Button
                label={isRunning ? 'Pause' : state && !state.done && state.left > 0 && state.left < timer.seconds ? 'Resume' : 'Start'}
                variant="secondary"
                icon={isRunning ? Pause : Play}
                onPress={startPause}
                accessibilityLabel={isRunning ? 'Pause timer' : 'Start timer'}
                testID="cook-timer-toggle"
                style={{ minWidth: t.sizes.button * 2 }}
              />
              {state ? <IconButton icon={RotateCcw} accessibilityLabel="Reset timer" onPress={reset} testID="cook-timer-reset" /> : null}
            </View>
          </View>
        ) : null}

        {otherRunning.length ? (
          <View style={{ gap: t.spacing.xxs }} testID="cook-other-timers">
            {otherRunning.map(([k, v]) => (
              <PressableScale
                key={k}
                onPress={() => go(Number(k))}
                accessibilityRole="button"
                accessibilityLabel={`Step ${Number(k) + 1} timer, ${formatClock(remainingSeconds(v.endsAt ?? 0, now))} left. Go to step`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs, minHeight: t.sizes.touch, paddingHorizontal: t.spacing.md, borderRadius: t.radius.pill, backgroundColor: t.colors.accentSoft, alignSelf: 'flex-start' }}
              >
                <Timer color={t.colors.textPrimary} size={t.sizes.iconSmall} strokeWidth={t.sizes.iconStroke} />
                <Text variant="callout" tabular>
                  Step {Number(k) + 1} · {formatClock(remainingSeconds(v.endsAt ?? 0, now))}
                </Text>
              </PressableScale>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: t.spacing.sm, paddingHorizontal: t.spacing.screen, paddingTop: t.spacing.sm, paddingBottom: insets.bottom + t.spacing.sm }}>
        {step > 0 ? (
          <Button label="Back" variant="secondary" onPress={() => go(step - 1)} testID="cook-prev" style={{ flex: 1 }} />
        ) : null}
        <Button
          label={last ? (params.mealId ? 'Done · Ate it' : 'Done') : 'Next step'}
          onPress={last ? finish : () => go(step + 1)}
          testID={last ? 'cook-done' : 'cook-next'}
          style={{ flex: 2 }}
        />
      </View>

      <Sheet open={showIngredients} onClose={() => setShowIngredients(false)} title={`Ingredients · ${formatServings(servings)} ${servings === 1 ? 'serving' : 'servings'}`} testID="cook-ingredients-sheet">
        {/* Sheet has no scroll of its own: 10–15 ingredients scroll here instead of clipping. */}
        <ScrollView nestedScrollEnabled style={{ maxHeight: windowHeight * 0.6 }} testID="cook-ingredients-list">
          {scaledIngredients(recipe, servings, cat.foodById).map((ing, i) => (
            <View
              key={ing.foodId}
              style={{
                flexDirection: 'row',
                minHeight: t.sizes.touch,
                alignItems: 'center',
                gap: t.spacing.sm,
                borderTopWidth: i === 0 ? 0 : t.sizes.hairline,
                borderTopColor: t.colors.border,
              }}
            >
              <Text style={{ flex: 1 }}>{ing.name}</Text>
              <Text variant="callout" color="textSecondary" tabular>
                {formatGrams(ing.grams)}
              </Text>
            </View>
          ))}
        </ScrollView>
      </Sheet>
    </View>
  );
}
