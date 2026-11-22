/**
 * Step count, READ only (owner override 22 Nov, D-STEPS): the Home dashboard steps tile.
 *  - iOS: CoreMotion via expo-sensors `Pedometer.getStepCountAsync` (NSMotionUsageDescription).
 *  - Android: the day's total from Health Connect (Steps read permission only). Without Health
 *    Connect, the expo-sensors pedometer counts while the app is open (`watchStepCount`).
 * Permission is asked only when the user taps "Turn on steps", never at launch. Every call is
 * best effort: any failure reads as "off", it never throws into the UI and never blocks it.
 */
import { Platform } from 'react-native';
import { Pedometer } from 'expo-sensors';

import { kv } from './storage';

export type StepsSource = 'coremotion' | 'health_connect' | 'pedometer';
export type StepsAccess = 'granted' | 'denied' | 'undetermined' | 'unavailable';
export type StepsRead =
  | { ok: true; source: StepsSource; /** null = this source has no daily total (live pedometer). */ steps: number | null }
  | { ok: false; reason: 'not_asked' | 'denied' | 'unavailable' };

const OPT_IN_KEY = 'steps.enabled';
const STEPS_READ = { accessType: 'read', recordType: 'Steps' } as const;
/** Health Connect `SdkAvailabilityStatus.SDK_AVAILABLE`. */
const HC_AVAILABLE = 3;

type HealthConnect = typeof import('react-native-health-connect');

/** Health Connect is a TurboModule: required lazily, Android only, and never fatal. */
function healthConnect(): HealthConnect | null {
  if (Platform.OS !== 'android') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-health-connect') as HealthConnect;
  } catch {
    return null;
  }
}

/** The user tapped "Turn on steps" at least once (until then we never touch the sensors). */
export function stepsOptedIn(): boolean {
  try {
    return kv.getString(OPT_IN_KEY) === '1';
  } catch {
    return false;
  }
}

function setOptedIn(on: boolean): void {
  try {
    if (on) kv.set(OPT_IN_KEY, '1');
    else kv.remove(OPT_IN_KEY);
  } catch {
    // preference only
  }
}

/** Turn the tile off again (Settings). Phone permissions stay as the user set them. */
export function turnOffSteps(): void {
  setOptedIn(false);
}

/** Health Connect ready on this phone (installed/updated and initialised). */
async function hcReady(hc: HealthConnect): Promise<boolean> {
  try {
    if ((await hc.getSdkStatus()) !== HC_AVAILABLE) return false;
    return await hc.initialize();
  } catch {
    return false;
  }
}

async function hcGranted(hc: HealthConnect): Promise<boolean> {
  try {
    const granted = await hc.getGrantedPermissions();
    return granted.some((p) => p.recordType === 'Steps' && p.accessType === 'read');
  } catch {
    return false;
  }
}

async function pedometerAccess(ask: boolean): Promise<StepsAccess> {
  try {
    if (!(await Pedometer.isAvailableAsync())) return 'unavailable';
    const res = ask ? await Pedometer.requestPermissionsAsync() : await Pedometer.getPermissionsAsync();
    if (res.granted) return 'granted';
    return res.canAskAgain === false || res.status === 'denied' ? 'denied' : 'undetermined';
  } catch {
    return 'unavailable';
  }
}

/** Which source this phone uses and whether we may read it (never prompts). */
export async function stepsAccess(): Promise<{ access: StepsAccess; source: StepsSource | null }> {
  const hc = healthConnect();
  if (hc && (await hcReady(hc))) {
    return { access: (await hcGranted(hc)) ? 'granted' : 'undetermined', source: 'health_connect' };
  }
  const access = await pedometerAccess(false);
  return { access, source: access === 'unavailable' ? null : Platform.OS === 'ios' ? 'coremotion' : 'pedometer' };
}

/**
 * "Turn on steps": asks for the read permission in context. Health Connect first on Android,
 * then the phone's pedometer. Returns the resulting access.
 */
export async function enableSteps(): Promise<StepsAccess> {
  setOptedIn(true);
  const hc = healthConnect();
  if (hc && (await hcReady(hc))) {
    try {
      if (await hcGranted(hc)) return 'granted';
      const res = await hc.requestPermission([STEPS_READ]);
      if (res.some((p) => p.recordType === 'Steps' && p.accessType === 'read')) return 'granted';
    } catch {
      // fall through to the pedometer
    }
  }
  return pedometerAccess(true);
}

/** Steps between `start` and `end` (normally local midnight → now). */
export async function readSteps(start: Date, end: Date): Promise<StepsRead> {
  if (!stepsOptedIn()) return { ok: false, reason: 'not_asked' };
  const hc = healthConnect();
  if (hc && (await hcReady(hc)) && (await hcGranted(hc))) {
    try {
      const r = await hc.aggregateRecord({
        recordType: 'Steps',
        timeRangeFilter: { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() },
      });
      return { ok: true, source: 'health_connect', steps: Math.max(0, Math.round(r.COUNT_TOTAL ?? 0)) };
    } catch {
      // fall through to the pedometer
    }
  }
  const access = await pedometerAccess(false);
  if (access === 'unavailable') return { ok: false, reason: 'unavailable' };
  if (access !== 'granted') return { ok: false, reason: 'denied' };
  if (Platform.OS === 'ios') {
    try {
      const r = await Pedometer.getStepCountAsync(start, end);
      return { ok: true, source: 'coremotion', steps: Math.max(0, Math.round(r.steps)) };
    } catch {
      return { ok: false, reason: 'unavailable' };
    }
  }
  // Android pedometer has no history: the caller counts live with watchSteps.
  return { ok: true, source: 'pedometer', steps: null };
}

/** Live steps since subscribing (Android fallback while the app is open). Returns unsubscribe. */
export function watchSteps(onSteps: (sinceStart: number) => void): () => void {
  try {
    const sub = Pedometer.watchStepCount((r) => onSteps(Math.max(0, Math.round(r.steps))));
    return () => sub.remove();
  } catch {
    return () => {};
  }
}
