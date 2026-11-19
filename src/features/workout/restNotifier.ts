/**
 * Default rest-timer surface: local notifications via expo-notifications (sheet 17, N-5).
 *  - "Rest over · Next: {exercise} set {n}" scheduled at the end time on the high-importance
 *    `timer` channel (iOS: time-sensitive), so it fires with the app backgrounded or killed.
 *  - Android: an ongoing (sticky, silent) notification "Resting · back at 13:10" while it runs.
 * expo-notifications is loaded defensively: without it (tests, a build missing the module) the
 * timer still works in-app. Permission is asked by the notifications primer, never here.
 */
import { Platform } from 'react-native';

import { clockTime } from './logic/dates';
import { formatCountdown } from './logic/duration';
import { remainingMs, type ActiveRest } from './logic/restTimer';
import { registerRestTimerSurface, type RestTimerSurface } from './restTimerStore';

/** The slice of expo-notifications this surface uses (kept structural so tests can fake it). */
export type NotificationsLike = {
  scheduleNotificationAsync(request: {
    identifier?: string;
    content: Record<string, unknown>;
    trigger: Record<string, unknown> | null;
  }): Promise<string>;
  cancelScheduledNotificationAsync(id: string): Promise<void>;
  dismissNotificationAsync(id: string): Promise<void>;
  setNotificationChannelAsync?(id: string, channel: Record<string, unknown>): Promise<unknown>;
  AndroidImportance?: { HIGH?: number; LOW?: number };
};

export const REST_OVER_ID = 'repwise-rest-over';
export const REST_ONGOING_ID = 'repwise-rest-ongoing';
export const TIMER_CHANNEL = 'timer';
export const ONGOING_CHANNEL = 'timer-ongoing';

export function restOverContent(state: ActiveRest): { title: string; body: string } {
  return {
    title: 'Rest over',
    body: state.next ? `Next: ${state.next.exercise} set ${state.next.setNo}` : 'Time for your next set',
  };
}

export function ongoingContent(state: ActiveRest, now: number): { title: string; body: string } {
  const next = state.next ? ` · Next: ${state.next.exercise}` : '';
  if (state.status === 'paused') {
    return { title: 'Rest paused', body: `${formatCountdown(remainingMs(state, now))} left${next}` };
  }
  return { title: 'Resting', body: `Back at ${clockTime(state.endsAt)}${next}` };
}

export function createNotificationSurface(
  n: NotificationsLike,
  clock: () => number = Date.now,
): RestTimerSurface {
  const quiet = (p: Promise<unknown> | undefined) => {
    p?.catch(() => undefined);
  };
  let channelsReady: Promise<unknown> | null = null;
  const channels = () => {
    if (Platform.OS !== 'android' || !n.setNotificationChannelAsync) return Promise.resolve();
    channelsReady ??= Promise.all([
      n.setNotificationChannelAsync(TIMER_CHANNEL, {
        name: 'Rest timer',
        importance: n.AndroidImportance?.HIGH ?? 4,
        sound: 'default',
        vibrationPattern: [0, 250, 150, 250],
      }),
      n.setNotificationChannelAsync(ONGOING_CHANNEL, {
        name: 'Rest timer (running)',
        importance: n.AndroidImportance?.LOW ?? 2,
        sound: null,
        enableVibrate: false,
        showBadge: false,
      }),
    ]).catch(() => undefined);
    return channelsReady;
  };

  const schedule = (state: ActiveRest) => {
    quiet(n.cancelScheduledNotificationAsync(REST_OVER_ID));
    if (state.status !== 'running') return;
    quiet(
      channels().then(() =>
        n.scheduleNotificationAsync({
          identifier: REST_OVER_ID,
          content: {
            ...restOverContent(state),
            sound: 'default',
            data: { kind: 'rest_over', sessionId: state.sessionId, url: `/workout/${state.sessionId}` },
            ...(Platform.OS === 'ios' ? { interruptionLevel: 'timeSensitive' } : { priority: 'max' }),
          },
          trigger: { type: 'date', date: state.endsAt, channelId: TIMER_CHANNEL },
        }),
      ),
    );
  };

  const ongoing = (state: ActiveRest) => {
    if (Platform.OS !== 'android') return;
    quiet(
      channels().then(() =>
        n.scheduleNotificationAsync({
          identifier: REST_ONGOING_ID,
          content: {
            ...ongoingContent(state, clock()),
            sticky: true,
            autoDismiss: false,
            priority: 'low',
            data: { kind: 'rest_ongoing', url: `/workout/${state.sessionId}` },
          },
          trigger: { channelId: ONGOING_CHANNEL },
        }),
      ),
    );
  };

  return {
    start(state) {
      schedule(state);
      ongoing(state);
    },
    update(state) {
      schedule(state);
      ongoing(state);
    },
    end(reason) {
      if (reason !== 'done') quiet(n.cancelScheduledNotificationAsync(REST_OVER_ID));
      if (Platform.OS === 'android') quiet(n.dismissNotificationAsync(REST_ONGOING_ID));
    },
  };
}

function loadNotifications(): NotificationsLike | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-notifications') as NotificationsLike;
    return typeof mod?.scheduleNotificationAsync === 'function' ? mod : null;
  } catch {
    return null;
  }
}

let installed = false;

/** Install the notification surface once (called when the player mounts). */
export function installRestNotifier(mod: NotificationsLike | null = loadNotifications()): boolean {
  if (installed || !mod) return installed;
  registerRestTimerSurface(createNotificationSurface(mod));
  installed = true;
  return true;
}

export function resetRestNotifierForTests(): void {
  installed = false;
}
