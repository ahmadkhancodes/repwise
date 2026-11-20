/**
 * Rest timer lock-screen surfaces (W5, RW-23, N-5):
 * - iOS: Live Activity (modules/repwise-timer → ActivityKit; UI in targets/widget);
 * - Android: ongoing silent notification with a count-down chronometer (same native module);
 * - both: N-5 "Rest over" alert on the high-priority `timer` channel, so it fires with the app
 *   in the background.
 *
 * The workout player owns the timer. It either calls `updateRestTimerSurface(state)` on every
 * change, or hands its observable to `connectRestTimer(restTimer)`.
 */
import { requireOptionalNativeModule } from 'expo';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getAppPrefs } from '@/features/settings/prefs';

import {
  planRestSurface,
  REST_ALERT_ID,
  restAlertChannel,
  type RestTimerApi,
  type RestTimerState,
  type TimerSurfacePayload,
} from './logic/restSurface';

export type { RestTimerApi, RestTimerState };

type NativeTimer = {
  areActivitiesEnabled(): boolean;
  update(payload: TimerSurfacePayload): Promise<boolean>;
  end(): Promise<void>;
  showOngoing(payload: TimerSurfacePayload): Promise<boolean>;
  cancelOngoing(): Promise<void>;
  /** Additive API (docs/NATIVE.md): lock-screen / Live Activity +15 s and Skip taps. */
  addListener?(event: 'onRestAction', listener: (e: unknown) => void): { remove(): void };
  consumeRestActions?(): unknown[];
};

/** A +15 s / Skip tap on the lock screen or Live Activity (docs/NATIVE.md). */
export type RestAction = {
  id: string;
  action: 'add15' | 'skip';
  at: number;
  endsAt?: number;
  sessionId?: string;
};

/** Validate one native event (never trust the bridge's shape). Pure. */
export function toRestAction(e: unknown): RestAction | null {
  if (!e || typeof e !== 'object') return null;
  const o = e as Record<string, unknown>;
  if (typeof o.id !== 'string' || (o.action !== 'add15' && o.action !== 'skip')) return null;
  return {
    id: o.id,
    action: o.action,
    at: typeof o.at === 'number' ? o.at : 0,
    ...(typeof o.endsAt === 'number' ? { endsAt: o.endsAt } : {}),
    ...(typeof o.sessionId === 'string' ? { sessionId: o.sessionId } : {}),
  };
}

/**
 * Listen for lock-screen +15 s / Skip taps. The native buttons only appear once JS listens, so a
 * tap never moves the lock screen without the player knowing (N7). Returns the unsubscribe.
 */
export function subscribeRestActions(handler: (a: RestAction) => void): () => void {
  const mod = nativeTimer();
  if (!mod?.addListener) return () => undefined;
  try {
    const sub = mod.addListener('onRestAction', (e) => {
      const a = toRestAction(e);
      if (a) handler(a);
    });
    return () => sub.remove();
  } catch {
    return () => undefined;
  }
}

/** Taps queued natively while JS was not listening (oldest first); clears the queue. */
export function drainRestActions(): RestAction[] {
  try {
    const raw = nativeTimer()?.consumeRestActions?.() ?? [];
    return raw.map(toRestAction).filter((a): a is RestAction => a !== null);
  } catch {
    return [];
  }
}

/** null in Expo Go, on web and in Jest: only the N-5 alert is used then. */
let native: NativeTimer | null | undefined;
function nativeTimer(): NativeTimer | null {
  if (native === undefined) native = requireOptionalNativeModule<NativeTimer>('RepwiseTimer');
  return native;
}

let lastAlertAt: number | null = null;
let showing = false;

async function setAlert(at: number | null, title: string, body: string, sessionId: string | null) {
  if (at === lastAlertAt) return;
  lastAlertAt = at;
  await Notifications.cancelScheduledNotificationAsync(REST_ALERT_ID).catch(() => undefined);
  if (at == null || at <= Date.now()) return;
  const restSound = getAppPrefs().restSound;
  await Notifications.scheduleNotificationAsync({
    identifier: REST_ALERT_ID,
    content: {
      title,
      body,
      // Settings > Workout > Rest timer sound (iOS honours it per alert; Android uses the channel).
      sound: restSound ? 'default' : false,
      data: { kind: 'rest', url: '/train', ...(sessionId ? { sessionId } : {}) },
      interruptionLevel: 'timeSensitive',
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: restAlertChannel(restSound) },
  }).catch(() => undefined);
}

/*
 * Updates are serialised and coalesced: native calls never overlap, and only the latest state is
 * applied. A new rest replacing a running one publishes `null` then the new state in the same
 * tick; applying both concurrently let ActivityKit's end-all race the upsert and drop the new
 * Live Activity. Now the end is skipped and the activity is simply updated.
 */
let queued: { state: RestTimerState | null; now: number } | null = null;
let draining: Promise<void> | null = null;

async function drain(): Promise<void> {
  try {
    while (queued) {
      const next = queued;
      queued = null;
      await applySurface(next.state, next.now);
    }
  } finally {
    draining = null;
  }
}

/** Publish the current rest-timer state (null = rest finished or cancelled). Never throws. */
export function updateRestTimerSurface(state: RestTimerState | null, now = Date.now()): Promise<void> {
  queued = { state, now };
  // Start on a microtask so updates published in the same tick collapse into the last one.
  if (!draining) draining = Promise.resolve().then(drain);
  return draining;
}

async function applySurface(state: RestTimerState | null, now: number): Promise<void> {
  const plan = planRestSurface(state, now);
  const mod = nativeTimer();
  try {
    if (plan.type === 'end') {
      await setAlert(null, '', '', null);
      if (showing && mod) {
        if (Platform.OS === 'ios') await mod.end();
        else await mod.cancelOngoing();
      }
      showing = false;
      return;
    }
    await setAlert(plan.alertAt, plan.alert.title, plan.alert.body, plan.payload.sessionId);
    if (mod) {
      if (Platform.OS === 'ios') await mod.update(plan.payload);
      else await mod.showOngoing(plan.payload);
      showing = true;
    }
  } catch {
    // lock-screen surfaces are best effort; the in-app timer is the source of truth
  }
}

/**
 * "Delete all data": end every rest surface unconditionally (the "Rest over" alert, the Android
 * ongoing notification, the iOS Live Activity), including ones a previous launch left behind that
 * this process never tracked. Never throws.
 */
export async function stopRestSurfaces(): Promise<void> {
  await updateRestTimerSurface(null);
  lastAlertAt = null;
  await Notifications.cancelScheduledNotificationAsync(REST_ALERT_ID).catch(() => undefined);
  const mod = nativeTimer();
  try {
    if (mod) {
      if (Platform.OS === 'ios') await mod.end();
      else await mod.cancelOngoing();
    }
  } catch {
    // best effort
  }
  showing = false;
}

/** Mirror the workout player's rest timer onto the lock screen. Returns the unsubscribe. */
export function connectRestTimer(api: RestTimerApi): () => void {
  const off = api.subscribe((s) => {
    void updateRestTimerSurface(s);
  });
  return () => {
    off();
    void updateRestTimerSurface(null);
  };
}

/** Tests only. */
export function resetRestTimerForTests(mod?: NativeTimer | null): void {
  native = mod === undefined ? undefined : mod;
  lastAlertAt = null;
  showing = false;
  queued = null;
  draining = null;
}
