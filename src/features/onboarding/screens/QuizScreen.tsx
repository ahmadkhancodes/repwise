import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { BackHandler, Platform } from 'react-native';

import { haptics } from '@/services/haptics';

import { deviceContext, saveQuiz, trackStep } from '../actions';
import { QuizFrame } from '../components/QuizFrame';
import { StepContent } from '../components/StepContent';
import { QUESTIONS } from '../logic/options';
import {
  AUTO_ADVANCE,
  OPTIONAL,
  nextStep,
  prevStep,
  stepIndex,
  validateStep,
  visibleSteps,
  withStepDefaults,
  type StepId,
} from '../logic/steps';
import { useOnboarding } from '../store';

const AUTO_ADVANCE_MS = 220;

/** S03–S05: one question per screen, resumable, validated. */
export function QuizScreen({ step }: { step: StepId }) {
  const ctx = useMemo(() => deviceContext(), []);
  const answers = useOnboarding((s) => s.answers);
  const setAnswers = useOnboarding((s) => s.setAnswers);
  const [error, setError] = useState<string | null>(null);
  const advancing = useRef(false);

  const go = useCallback((to: StepId) => {
    useOnboarding.getState().setStep(to);
    router.push({ pathname: '/q/[step]', params: { step: to } });
  }, []);

  const back = useCallback(() => {
    const prev = prevStep(step, useOnboarding.getState().answers);
    if (router.canGoBack()) router.back();
    else if (prev) router.replace({ pathname: '/q/[step]', params: { step: prev } });
    else router.replace('/welcome');
    return true;
  }, [step]);

  useFocusEffect(
    useCallback(() => {
      const s = useOnboarding.getState();
      s.setStep(step);
      s.setAnswers(withStepDefaults(step, s.answers, ctx.today, ctx.todayWeekday));
      trackStep(step, stepIndex(step, s.answers));
      advancing.current = false;
      setError(null);
      // Android back = previous question (the stack may be empty after a resume).
      const sub =
        Platform.OS === 'android' ? BackHandler.addEventListener('hardwareBackPress', back) : null;
      return () => sub?.remove();
    }, [step, ctx.today, ctx.todayWeekday, back]),
  );

  const next = useCallback(() => {
    const current = useOnboarding.getState().answers;
    const problem = validateStep(step, current, ctx.today);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    haptics.light();
    const to = nextStep(step, current);
    if (to) {
      go(to);
      return;
    }
    // Last question: the profile row is the user's first real data.
    saveQuiz(current, ctx);
    useOnboarding.getState().setPhase('notify');
    router.push('/notify');
  }, [step, ctx, go]);

  const onChosen = useCallback(() => {
    if (!AUTO_ADVANCE.has(step) || advancing.current) return;
    advancing.current = true;
    setTimeout(next, AUTO_ADVANCE_MS);
  }, [step, next]);

  const skip = useCallback(() => {
    if (step === 'target') setAnswers({ targetKg: null });
    const to = nextStep(step, useOnboarding.getState().answers);
    if (to) go(to);
    else next();
  }, [step, setAnswers, go, next]);

  const q = QUESTIONS[step];
  const list = visibleSteps(answers);

  return (
    <QuizFrame
      testID={`screen-quiz-${step}`}
      title={q.title}
      subtitle={q.subtitle}
      index={Math.max(0, list.indexOf(step))}
      total={list.length}
      onBack={back}
      onNext={next}
      nextLabel={nextStep(step, answers) ? 'Continue' : 'Build my plan'}
      error={error}
      onSkip={OPTIONAL.has(step) ? skip : undefined}
    >
      <StepContent
        step={step}
        answers={answers}
        set={(patch) => {
          setError(null);
          setAnswers(patch);
        }}
        onChosen={onChosen}
        today={ctx.today}
        todayWeekday={ctx.todayWeekday}
        twelveHour={ctx.twelveHour}
      />
    </QuizFrame>
  );
}
