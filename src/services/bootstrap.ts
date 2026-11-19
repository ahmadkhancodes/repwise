/**
 * Background services started once the local database is ready. Everything here is
 * fire-and-forget: the UI never waits on the network.
 */
import { startSync } from '@/sync';

import { initAuth } from './auth';
import { warmCatalog } from './catalog';

let started = false;

export function startBackgroundServices(): void {
  if (started) return;
  started = true;
  initAuth()
    .catch(() => undefined)
    .then(() => startSync());
  warmCatalog();
}
