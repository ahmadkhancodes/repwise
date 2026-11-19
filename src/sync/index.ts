/**
 * Sync (sheet 13): push dirty rows / pull by the server cursor, last-write-wins on updated_at,
 * soft deletes. Talks to the Worker only through src/services/api.ts.
 */
export { startSync, shouldPull, PUSH_DEBOUNCE_MS, PULL_MIN_INTERVAL_MS } from './scheduler';
export { syncNow, useSyncStatus, type SyncResult } from './syncEngine';
