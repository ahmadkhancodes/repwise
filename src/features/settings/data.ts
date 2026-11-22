/**
 * Settings → "Your data": export everything as JSON through the share sheet, and delete all
 * personal data on this phone (plus the backup account when there is one). Local only, except
 * the optional server delete. Purchases are never touched: Pro stays and can always be restored.
 */
import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { getRawDb } from '@/db/client';
import { notifyLocalWrite } from '@/db/events';
import { stopRestSurfaces } from '@/features/notifications/restTimer';
import { useOnboarding } from '@/features/onboarding/store';
import { PHOTO_DIR } from '@/features/progress/logic/photos';
import { restTimer } from '@/features/workout/restTimerStore';
import { track } from '@/services/analytics';
import { deleteAccount, useAuth } from '@/services/auth';
import { kv } from '@/services/storage';

import {
  buildExport,
  deletePlan,
  exportedRows,
  exportFileName,
  isExportFileName,
  type ExportRow,
} from './logic/data';

/** Every user table (sheet 14), in SQL names. Migrations bookkeeping is never touched. */
export const USER_TABLES = [
  'profile',
  'plans',
  'sessions',
  'session_exercises',
  'sets',
  'exercises',
  'routines',
  'meal_plans',
  'meals',
  'recipes',
  'food_logs',
  'body_metrics',
  'photos',
  'cards',
  'daily_steps',
] as const;

/** Per-device MMKV keys that hold personal data (not theme, reminders or purchases). */
export const PERSONAL_KV_KEYS = [
  'meals.signals.v1',
  'assistant.deloadRequestedAt',
  'workout.restTimer.v1',
  'water.goal.ml',
  'library.prefs.v1',
  'widget.snapshot.v1',
  'review.state',
] as const;

/** "1.0.0" from the app config (falls back to "dev"). */
export function appVersion(): string {
  try {
    return Constants.expoConfig?.version ?? 'dev';
  } catch {
    return 'dev';
  }
}

function snakeToCamel(row: Record<string, unknown>): ExportRow {
  const out: ExportRow = {};
  for (const [k, v] of Object.entries(row)) {
    const key = k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    // JSON columns come back as text: parse so the export stays readable.
    if (typeof v === 'string' && (v.startsWith('[') || v.startsWith('{'))) {
      try {
        out[key] = JSON.parse(v);
        continue;
      } catch {
        // plain text that looks like JSON
      }
    }
    out[key] = v;
  }
  return out;
}

/** All rows of every table (soft-deleted ones dropped by `buildExport`). */
export function readAllTables(): Record<string, ExportRow[]> {
  const db = getRawDb();
  const out: Record<string, ExportRow[]> = {};
  for (const table of USER_TABLES) {
    try {
      out[table] = db
        .getAllSync<Record<string, unknown>>(`SELECT * FROM ${table}`)
        .map(snakeToCamel);
    } catch {
      out[table] = [];
    }
  }
  return out;
}

export type ExportResult =
  { status: 'shared'; rows: number } | { status: 'unavailable' } | { status: 'error' };

/** Write the export to the cache directory and open the share sheet. */
export async function exportAllData(now: number = Date.now()): Promise<ExportResult> {
  try {
    const file = buildExport(readAllTables(), { appVersion: appVersion(), now });
    if (!(await Sharing.isAvailableAsync())) return { status: 'unavailable' };
    const out = new File(Paths.cache, exportFileName(now));
    if (out.exists) out.delete();
    out.create();
    out.write(JSON.stringify(file, null, 2));
    await Sharing.shareAsync(out.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Export your Repwise data',
      UTI: 'public.json',
    });
    track('data_exported', { rows: exportedRows(file) });
    return { status: 'shared', rows: exportedRows(file) };
  } catch {
    return { status: 'error' };
  }
}

export type DeleteResult = { status: 'deleted' } | { status: 'error'; error: unknown };

/** Every export JSON left in the cache (one per day exported): it holds the full dataset. */
function deleteExportFiles(): void {
  try {
    for (const entry of new Directory(Paths.cache).list()) {
      if (entry instanceof File && isExportFileName(entry.name)) entry.delete();
    }
  } catch {
    // no cache listing: nothing to delete
  }
}

/** Remove every personal row, file and per-device key on this phone. */
export function wipeLocalData(): void {
  // A running rest belongs to a workout that is about to vanish: stop it, its "Rest over" alert
  // and its lock-screen surfaces, before its store could re-persist anything (R2-4).
  restTimer.skip();
  void stopRestSurfaces();
  const db = getRawDb();
  db.withTransactionSync(() => {
    for (const table of USER_TABLES) db.execSync(`DELETE FROM ${table}`);
  });
  for (const table of USER_TABLES) notifyLocalWrite(table);
  try {
    const dir = new Directory(Paths.document, PHOTO_DIR);
    if (dir.exists) dir.delete();
  } catch {
    // no photos folder
  }
  deleteExportFiles();
  for (const key of PERSONAL_KV_KEYS) {
    try {
      kv.remove(key);
    } catch {
      // MMKV failure is not fatal
    }
  }
  useOnboarding.getState().reset();
}

/**
 * "Delete all data": the backup account first when signed in (a failure stops everything so
 * nothing is left behind on the server), then everything on this phone.
 */
export async function deleteAllData(): Promise<DeleteResult> {
  const plan = deletePlan(useAuth.getState().status);
  if (plan.deleteServerAccount) {
    try {
      await deleteAccount();
    } catch (error) {
      if (plan.serverRequired) return { status: 'error', error };
    }
  }
  try {
    wipeLocalData();
  } catch (error) {
    return { status: 'error', error };
  }
  track('data_deleted', { account: plan.serverRequired });
  return { status: 'deleted' };
}
