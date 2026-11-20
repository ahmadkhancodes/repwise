/**
 * Paywall trial timeline (sheet 05: honest trial, reminder 2 days before it ends). Pure.
 */
import { TRIAL_REMINDER_DAYS_BEFORE_END } from '../config';

export type TimelineStep = {
  key: 'today' | 'reminder' | 'billed';
  day: string;
  title: string;
  body: string;
};

/** "Today → Day 5 → Day 7" for a trial, or [] without one. */
export function trialTimeline(trialDays: number, priceAfter: string): TimelineStep[] {
  if (!(trialDays > 0)) return [];
  const remindDay = Math.max(1, trialDays - TRIAL_REMINDER_DAYS_BEFORE_END);
  const steps: TimelineStep[] = [
    {
      key: 'today',
      day: 'Today',
      title: 'Full access starts',
      body: 'Your whole plan, every workout and meal.',
    },
  ];
  if (remindDay > 1 && remindDay < trialDays) {
    steps.push({
      key: 'reminder',
      day: `Day ${remindDay}`,
      title: 'We remind you',
      body: 'A notification before your trial ends.',
    });
  }
  steps.push({
    key: 'billed',
    day: `Day ${trialDays}`,
    title: `Billed ${priceAfter}`,
    body: 'Cancel before then and you pay nothing.',
  });
  return steps;
}
