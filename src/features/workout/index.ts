/**
 * workout domain (sheet 13): components/, hooks/, logic/ (pure, unit-tested), repo.ts (Drizzle).
 * Screens are re-exported by thin routes in app/workout and app/(tabs)/train.
 *
 * For other features:
 *  - Today: <ResumeBanner />, useActiveSession(); start/open a session with
 *    router.push(trainHref(id)) (`/train?sessionId=…&start=1`, which starts or resumes it).
 *  - Notifications / widgets (Live Activity, Android chronometer): `restTimer` (getState/subscribe)
 *    and `registerRestTimerSurface({ start, update, end })`.
 *  - Planner: `registerSwapProvider(fn)` to own exercise swaps.
 */
export { ResumeBanner } from './components/ResumeBanner';
export { parseTrainLink, trainHref } from './logic/deepLink';
export { useActiveSession } from './hooks/useTrain';
export {
  restTimer,
  registerRestTimerSurface,
  type RestEndReason,
  type RestTimerSurface,
} from './restTimerStore';
export {
  remainingMs as restRemainingMs,
  type ActiveRest,
  type RestNext,
  type RestTimerState,
} from './logic/restTimer';
export { registerSwapProvider, type SwapProvider, type SwapRequest } from './logic/swap';
