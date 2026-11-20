/**
 * Moved to src/db/live.ts (perf audit r2 N3): every live hook shares one frame-coalesced change
 * subscription there. Re-exported so workout callers keep their import.
 */
export { useLiveValue, type LiveValue } from '@/db/live';
