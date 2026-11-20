/**
 * Settings → Profile & plan (S38): pure helpers for the summary card and the plan editor.
 */
import {
  GOAL_OPTIONS,
  labelOf,
  LOCATION_OPTIONS,
  WEEKDAY_SHORT,
} from '@/features/onboarding/logic/options';
import type { Location } from '@/features/onboarding/logic/answers';

/** Gym-only kit: owning any of it means a gym. Pure. */
const GYM_ONLY = [
  'barbell',
  'squat_rack',
  'cable',
  'machine',
  'smith',
  'trap_bar',
  'cardio_machine',
];

/** Where the user trains, from their equipment list. Pure. */
export function locationOf(equipment: readonly string[] | null | undefined): Location {
  const kit = equipment ?? [];
  if (kit.some((e) => GYM_ONLY.includes(e))) return 'gym';
  if (kit.some((e) => e !== 'bodyweight' && e !== 'mat')) return 'home';
  return 'bodyweight';
}

export type ProfileLike = {
  goal?: string | null;
  days?: number | null;
  sessionMin?: number | null;
  equipment?: string[] | null;
};

/** "Lose fat" + "4 days · 60 min · Gym" for the Settings card. Pure. */
export function profileSummary(p: ProfileLike | undefined | null): { title: string; line: string } {
  if (!p || !p.goal)
    return { title: 'Set up your plan', line: 'Answer a few questions to get started' };
  const parts = [
    p.days ? `${p.days} ${p.days === 1 ? 'day' : 'days'}` : null,
    p.sessionMin ? `${p.sessionMin} min` : null,
    labelOf(LOCATION_OPTIONS, locationOf(p.equipment)),
  ].filter(Boolean);
  return {
    title: labelOf(GOAL_OPTIONS, p.goal as never) || 'Your plan',
    line: parts.join(' · '),
  };
}

/** "Mon · Wed · Fri" (0 = Monday). Pure. */
export function weekdaysLabel(days: readonly number[]): string {
  return [...days]
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_SHORT[d])
    .filter(Boolean)
    .join(' · ');
}

export type PlanDraft = {
  goal: string;
  days: number;
  weekdays: number[];
  sessionMin: number;
  location: Location;
  equipment: string[];
};

/** Fields that change the generated plan; true when the draft differs from the saved one. Pure. */
export function draftChanged(saved: PlanDraft, draft: PlanDraft): boolean {
  const same = (a: readonly (string | number)[], b: readonly (string | number)[]) =>
    a.length === b.length && [...a].sort().join() === [...b].sort().join();
  return (
    saved.goal !== draft.goal ||
    saved.days !== draft.days ||
    saved.sessionMin !== draft.sessionMin ||
    !same(saved.weekdays, draft.weekdays) ||
    !same(saved.equipment, draft.equipment)
  );
}

/** Validation message, or null when the draft can be saved. Pure. */
export function draftProblem(d: PlanDraft): string | null {
  if (d.weekdays.length !== d.days) {
    return `Pick ${d.days} training days (${d.weekdays.length} selected).`;
  }
  return null;
}
