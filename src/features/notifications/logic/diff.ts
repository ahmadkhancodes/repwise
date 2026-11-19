import { notificationHash, type PlannedNotification } from './schedule';

/** What we scheduled last time: OS identifier (= key) → content hash. Stored in MMKV. */
export type StoredSchedule = Record<string, string>;

export type ScheduleDiff = {
  cancel: string[];
  schedule: PlannedNotification[];
  next: StoredSchedule;
};

/**
 * Minimal OS work for a rebuild: cancel what disappeared or changed, schedule what is new or
 * changed, leave the rest alone. `osPending` (ids the OS still holds) re-adds anything the OS
 * dropped; ids we never stored are not ours (snooze, rest timer) and are never cancelled.
 */
export function diffSchedule(
  stored: StoredSchedule,
  desired: PlannedNotification[],
  osPending?: Iterable<string>,
): ScheduleDiff {
  const os = osPending ? new Set(osPending) : null;
  const next: StoredSchedule = {};
  const schedule: PlannedNotification[] = [];
  const cancel: string[] = [];
  const want = new Map(desired.map((n) => [n.key, n]));

  for (const key of Object.keys(stored)) {
    const n = want.get(key);
    if (!n || notificationHash(n) !== stored[key]) cancel.push(key);
  }
  for (const n of desired) {
    const hash = notificationHash(n);
    next[n.key] = hash;
    const same = stored[n.key] === hash;
    if (!same || (os && !os.has(n.key))) schedule.push(n);
  }
  return { cancel, schedule, next };
}

export function parseStored(raw: string | undefined | null): StoredSchedule {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out: StoredSchedule = {};
    for (const [k, h] of Object.entries(v)) if (typeof h === 'string') out[k] = h;
    return out;
  } catch {
    return {};
  }
}
