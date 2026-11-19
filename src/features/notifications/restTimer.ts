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

import {
  planRestSurface,
  REST_ALERT_ID,
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
};

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
  await Notifications.scheduleNotificationAsync({
    identifier: REST_ALERT_ID,
    content: {
      title,
      body,
      sound: 'default',
      data: { kind: 'rest', url: '/train', ...(sessionId ? { sessionId } : {}) },
      interruptionLevel: 'timeSensitive',
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: 'timer' },
  }).catch(() => undefined);
}

/** Publish the current rest-timer state (null = rest finished or cancelled). Never throws. */
export async function updateRestTimerSurface(state: RestTimerState | null, now = Date.now()): Promise<void> {
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
}
