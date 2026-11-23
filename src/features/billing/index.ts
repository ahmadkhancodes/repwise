/**
 * billing domain (sheet 05/16): Pro gate, paywall, subscription screen, pure billing logic.
 * The store + Worker plumbing lives in src/services/billing.ts.
 */
export { usePro, type ProState } from './hooks/usePro';
export { canOpenPaywall, useBilling } from './hooks/useBilling';
export {
  trialReminderAt,
  trialEndFromStart,
  DEFAULT_QUIET_HOURS,
  type QuietHours,
} from './logic/trialReminder';
export { manageSubscriptionUrl } from './logic/manage';
export { openGate, closeGate, useGateSheet, GateSheetHost } from './components/GateSheet';
export {
  GATES,
  gateSource,
  canSwapMeal,
  canLogAteOut,
  canViewMealDay,
  canAdaptPlan,
  type GateFeature,
} from './logic/gates';
