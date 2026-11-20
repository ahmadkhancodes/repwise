/**
 * Onboarding progress, persisted to MMKV after every answer so killing the app mid-quiz resumes
 * on the same step with the same answers (F1). User data proper (the profile row) is written to
 * SQLite when the quiz is finished.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { zustandStorage } from '@/services/storage';

import type { Answers } from './logic/answers';
import { EMPTY_ANSWERS } from './logic/emptyAnswers';
import type { Phase } from './logic/flow';
import type { StepId } from './logic/steps';

export type OnboardingState = {
  phase: Phase;
  step: StepId | null;
  answers: Answers;
  startedAt: number | null;
  completedAt: number | null;
  /** Set answers (merged). */
  setAnswers: (patch: Partial<Answers>) => void;
  setStep: (step: StepId) => void;
  setPhase: (phase: Phase) => void;
  start: (now?: number) => void;
  complete: (now?: number) => void;
  reset: () => void;
};

const initial = {
  phase: 'welcome' as Phase,
  step: null,
  answers: EMPTY_ANSWERS,
  startedAt: null,
  completedAt: null,
};

export const ONBOARDING_STORAGE_KEY = 'onboarding.v1';

export const useOnboarding = create<OnboardingState>()(
  persist(
    (set, get) => ({
      ...initial,
      setAnswers: (patch) => set({ answers: { ...get().answers, ...patch } }),
      setStep: (step) => set({ step, phase: 'quiz' }),
      setPhase: (phase) => set({ phase }),
      start: (now = Date.now()) =>
        set({ phase: 'quiz', startedAt: get().startedAt ?? now, step: get().step ?? 'goal' }),
      complete: (now = Date.now()) => set({ phase: 'done', completedAt: now }),
      reset: () => set({ ...initial }),
    }),
    {
      name: ONBOARDING_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
      partialize: (s) => ({
        phase: s.phase,
        step: s.step,
        answers: s.answers,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<OnboardingState>;
        return { ...current, ...p, answers: { ...EMPTY_ANSWERS, ...(p.answers ?? {}) } };
      },
    },
  ),
);
