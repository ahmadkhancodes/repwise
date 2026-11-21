/**
 * Local notifications (bible P-N1, sheet 17). All notifications are LOCAL (expo-notifications).
 *
 * - `rebuildSchedule()` recomputes the whole schedule from DB state with the pure builder
 *   (src/features/notifications/logic/schedule.ts) and applies only the difference to the OS;
 *   OS identifiers + content hashes are stored in MMKV.
 * - Android channels and the action-button categories from sheet 17.
 * - Action buttons are handled by `addNotificationResponseReceivedListener`, plus
 *   `getLastNotificationResponse()` on start so a tap that launched a killed app is not lost.
 * - Rebuilds after local writes (debounced), on foreground (date/time zone may have changed),
 *   on preference changes and when the billing entitlement changes. Never touches the network.
 */
import { router, type Href } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, AndroidNotificationVisibility } from 'expo-notifications';
import { AppState, Linking, Platform, type NativeEventSubscription } from 'react-native';
import { create } from 'zustand';

import { onLocalWrite } from '@/db/events';
import { loadDayPlans, loadProfileMealTimes, loadSnapshot } from '@/features/notifications/data';
import { diffSchedule, parseStored } from '@/features/notifications/logic/diff';
import { CATEGORY_ACTIONS, resolveResponse, responseKey, type NotificationIntent } from '@/features/notifications/logic/responses';
import {
  buildSchedule,
  type CategoryId,
  type ChannelId,
  type PlannedNotification,
} from '@/features/notifications/logic/schedule';
import { addDays, deviceTimeZone, localDateOf } from '@/features/notifications/logic/zonedTime';
import { getPrefs, useNotificationPrefs } from '@/features/notifications/prefsStore';
import { setMealStatus, mealsRepo } from '@/features/meals/repo';
import { colors } from '@/theme';
import { writeWidgetSnapshot } from '@/widgets/writer';

import { track } from './analytics';
import { isProNow, useBillingStore } from './billing';
import { kv } from './storage';

export type PermissionState = 'unknown' | 'undetermined' | 'granted' | 'denied';

type NotificationsState = {
  permission: PermissionState;
  /** False when the OS will not show the prompt again (send the user to Settings). */
  canAskAgain: boolean;
  /** The schedule as last built (soonest first), for the settings "Next up" card. */
  scheduled: PlannedNotification[];
  status: 'idle' | 'building' | 'ready' | 'error';
  error: string | null;
};

export const useNotificationsStore = create<NotificationsState>()(() => ({
  permission: 'unknown',
  canAskAgain: true,
  scheduled: [],
  status: 'idle',
  error: null,
}));

const K = {
  stored: 'notifications.scheduled.v1',
  handled: 'notifications.handledResponses.v1',
} as const;

/** Android channels (sheet 17). The ongoing rest-timer channel is created natively. */
/** Tables whose writes cannot change the schedule or the widget snapshot. */
export const IGNORED_WRITE_TABLES: ReadonlySet<string> = new Set(['sets']);
/** Delay of the launch rebuild (ms): it reads recipes, which must not compete with Today's first paint (perf A4). */
export const FIRST_REBUILD_DELAY_MS = 2500;

export const CHANNELS: { id: ChannelId; name: string; description: string; importance: AndroidImportance }[] = [
  { id: 'brief', name: 'Morning brief', description: "Today's workout and meals, and tomorrow's preview", importance: AndroidImportance.DEFAULT },
  { id: 'meals', name: 'Meals', description: 'Meal-time reminders from your plan', importance: AndroidImportance.HIGH },
  { id: 'training', name: 'Training', description: 'Workout reminders', importance: AndroidImportance.HIGH },
  { id: 'timer', name: 'Rest timer', description: 'Tells you when rest is over', importance: AndroidImportance.MAX },
  { id: 'timer-silent', name: 'Rest timer (silent)', description: 'Rest over, without sound (Settings → Rest timer sound off)', importance: AndroidImportance.MAX },
  { id: 'checkin', name: 'Weekly check-in', description: 'Your 30-second weekly check-in', importance: AndroidImportance.DEFAULT },
  { id: 'account', name: 'Account & trial', description: 'Trial reminders', importance: AndroidImportance.DEFAULT },
];

// ---------- permission ----------

/**
 * The app's view of the OS permission. Reads `status`, never `granted` alone: on Android 13+
 * expo-notifications reports `granted: true` whenever POST_NOTIFICATIONS is held, even when the
 * user switched the app's notifications off in system settings (`status: 'denied'`), and then
 * nothing is delivered. Exported for tests.
 */
export function toPermission(
  p: Pick<Notifications.NotificationPermissionsStatus, 'status' | 'granted'> & {
    ios?: { status?: number };
  },
): PermissionState {
  const iosStatus = p.ios?.status;
  // iOS provisional (3) / ephemeral (4) still deliver quietly.
  if (p.status === 'granted' || iosStatus === 3 || iosStatus === 4) return 'granted';
  return p.status === 'undetermined' ? 'undetermined' : 'denied';
}

export async function refreshPermission(): Promise<PermissionState> {
  try {
    const p = await Notifications.getPermissionsAsync();
    const permission = toPermission(p);
    useNotificationsStore.setState({ permission, canAskAgain: p.canAskAgain !== false });
    return permission;
  } catch {
    useNotificationsStore.setState({ permission: 'unknown' });
    return 'unknown';
  }
}

/**
 * Ask for permission (call only after a primer, never at launch — sheet 17). When the OS will not
 * prompt again, opens the system settings instead. Fires `notification_permission` (sheet 23).
 */
export async function requestPermission(): Promise<PermissionState> {
  const { canAskAgain, permission } = useNotificationsStore.getState();
  if (permission === 'denied' && !canAskAgain) {
    await Linking.openSettings().catch(() => undefined);
    return 'denied';
  }
  try {
    await ensureChannels(); // Android 13 shows the prompt only once a channel exists
    const p = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
    const result = toPermission(p);
    useNotificationsStore.setState({ permission: result, canAskAgain: p.canAskAgain !== false });
    track('notification_permission', { granted: result === 'granted' });
    if (result === 'granted') requestRebuild(0);
    return result;
  } catch {
    return refreshPermission();
  }
}

// ---------- channels + categories ----------

let channelsReady: Promise<void> | null = null;

export function ensureChannels(): Promise<void> {
  if (!channelsReady) {
    channelsReady = (async () => {
      if (Platform.OS === 'android') {
        for (const c of CHANNELS) {
          await Notifications.setNotificationChannelAsync(c.id, {
            name: c.name,
            description: c.description,
            importance: c.importance,
            lightColor: colors.light.accent,
            lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
            vibrationPattern: c.id === 'timer' || c.id === 'timer-silent' ? [0, 250, 150, 250] : [0, 200],
            sound: c.id === 'timer-silent' ? null : 'default',
          });
        }
      }
      for (const [id, actions] of Object.entries(CATEGORY_ACTIONS)) {
        if (!actions.length) continue;
        await Notifications.setNotificationCategoryAsync(
          id,
          actions.map((a) => ({
            identifier: a.id,
            buttonTitle: a.title,
            // Every button opens the app so the response reaches JS even from a killed app.
            options: { opensAppToForeground: true },
          })),
        );
      }
    })().catch((e: unknown) => {
      channelsReady = null;
      throw e;
    });
  }
  return channelsReady;
}

// ---------- schedule ----------

function contentFor(n: { title: string; body: string; data: object; categoryId: CategoryId }) {
  return {
    title: n.title,
    body: n.body,
    data: n.data as Record<string, unknown>,
    sound: 'default' as const,
    ...(n.categoryId !== 'open' ? { categoryIdentifier: n.categoryId } : {}),
  };
}

async function scheduleOne(n: PlannedNotification): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier: n.key,
    content: contentFor(n),
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.at, channelId: n.channelId },
  });
}

export type RebuildDeps = { now?: number; timeZone?: string };

let rebuilding: Promise<void> | null = null;
let rebuildAgain = false;

/**
 * Rebuild the whole schedule (and the widget snapshot) from local data. Coalesces concurrent
 * calls. Without permission it cancels what we scheduled and stores nothing.
 */
export function rebuildSchedule(deps: RebuildDeps = {}): Promise<void> {
  if (rebuilding) {
    rebuildAgain = true;
    return rebuilding;
  }
  rebuilding = (async () => {
    do {
      rebuildAgain = false;
      await rebuildOnce(deps);
    } while (rebuildAgain);
  })().finally(() => {
    rebuilding = null;
  });
  return rebuilding;
}

async function rebuildOnce({ now = Date.now(), timeZone = deviceTimeZone() }: RebuildDeps): Promise<void> {
  useNotificationsStore.setState({ status: 'building', error: null });
  const prefs = getPrefs();
  const isPro = isProNow(now);
  // The widget snapshot is written first: it must update even without notification permission.
  try {
    await writeWidgetSnapshot(loadSnapshot(now, timeZone, prefs, isPro));
  } catch {
    // widgets are best effort
  }
  try {
    const permission = await refreshPermission();
    const today = localDateOf(now, timeZone);
    const dates = Array.from({ length: 8 }, (_, i) => addDays(today, i));
    const ent = useBillingStore.getState().entitlement;
    const desired = buildSchedule({
      now,
      timeZone,
      prefs,
      permitted: permission === 'granted',
      isPro,
      days: loadDayPlans(dates),
      profileMealTimes: loadProfileMealTimes(),
      trial: ent ? { inTrial: ent.inTrial, expiresAt: ent.expiresAt, autoRenew: ent.autoRenew } : null,
    });
    await ensureChannels().catch(() => undefined);
    const osPending = await Notifications.getAllScheduledNotificationsAsync()
      .then((list) => list.map((r) => r.identifier))
      .catch(() => undefined);
    const diff = diffSchedule(parseStored(kv.getString(K.stored)), desired, osPending);
    for (const id of diff.cancel) {
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
    }
    const failed = new Set<string>();
    for (const n of diff.schedule) {
      await scheduleOne(n).catch(() => failed.add(n.key));
    }
    // A failed item is left out of the store so the next rebuild retries it.
    for (const key of failed) delete diff.next[key];
    kv.set(K.stored, JSON.stringify(diff.next));
    useNotificationsStore.setState({ scheduled: desired, status: 'ready' });
  } catch (e) {
    useNotificationsStore.setState({ status: 'error', error: e instanceof Error ? e.message : 'schedule failed' });
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Debounced rebuild (local writes come in bursts, e.g. logging several sets). */
export function requestRebuild(delayMs = 1500): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void rebuildSchedule();
  }, delayMs);
}

// ---------- responses ----------

function readHandled(): string[] {
  try {
    const v = JSON.parse(kv.getString(K.handled) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export type ResponseDeps = {
  navigate: (url: string) => void;
  logMeal: (mealId: string) => boolean;
  now: () => number;
};

const defaultDeps: ResponseDeps = {
  navigate: (url) => {
    // Let the navigator finish mounting when the tap launched the app.
    setTimeout(() => {
      try {
        router.push(url as Href);
      } catch {
        // navigation not ready: the user lands on the default screen instead
      }
    }, 0);
  },
  logMeal: (mealId) => {
    const meal = mealsRepo.get(mealId);
    if (!meal) return false;
    if (meal.status !== 'eaten') setMealStatus(mealId, 'eaten');
    track('meal_logged', { slot: meal.slot, from_plan: true });
    return true;
  },
  now: () => Date.now(),
};

async function runIntent(intent: NotificationIntent, deps: ResponseDeps): Promise<void> {
  switch (intent.type) {
    case 'logMeal':
      deps.logMeal(intent.mealId);
      deps.navigate(intent.then);
      return;
    case 'navigate':
      deps.navigate(intent.url);
      return;
    case 'snooze':
      await Notifications.scheduleNotificationAsync({
        identifier: intent.key,
        content: contentFor({ ...intent.content, data: { ...intent.content.data } }),
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: deps.now() + intent.minutes * 60_000,
          channelId: intent.content.channelId,
        },
      });
      return;
    case 'none':
      return;
  }
}

/** Handle one notification response exactly once (listener + cold-start read both call this). */
export async function handleResponse(
  response: Notifications.NotificationResponse,
  deps: ResponseDeps = defaultDeps,
): Promise<NotificationIntent | null> {
  const req = response.notification.request;
  const input = {
    actionIdentifier: response.actionIdentifier,
    identifier: req.identifier,
    title: req.content.title ?? null,
    body: req.content.body ?? null,
    data: req.content.data,
    date: response.notification.date,
  };
  const key = responseKey(input);
  const handled = readHandled();
  if (handled.includes(key)) return null;
  kv.set(K.handled, JSON.stringify([...handled, key].slice(-50)));
  track('app_open', { source: 'notification' });
  const intent = resolveResponse(input);
  try {
    await runIntent(intent, deps);
  } catch {
    // a failed snooze must not crash the app
  }
  // Swipe-dismiss the notification the action came from (Android leaves it otherwise).
  Notifications.dismissNotificationAsync(req.identifier).catch(() => undefined);
  return intent;
}

// ---------- lifecycle ----------

export type ForegroundBehavior = {
  shouldShowBanner: boolean;
  shouldShowList: boolean;
  shouldPlaySound: boolean;
  shouldSetBadge: boolean;
};

/**
 * How a notification shows while the app is open. "Rest over" has exactly one foreground cue
 * (N5): the in-app one the player presents (`data.inApp`) at the moment the rest ends. The
 * scheduled alert (iOS) and the Android service's on-time alert, which land ~16 ms earlier, stay
 * silent and hidden in the foreground; in the background they are the cue. Pure.
 */
export function foregroundBehavior(data: unknown, appActive: boolean): ForegroundBehavior {
  const d = (data && typeof data === 'object' ? data : {}) as { kind?: unknown; inApp?: unknown };
  const quiet = appActive && d.kind === 'rest' && d.inApp !== true;
  return { shouldShowBanner: !quiet, shouldShowList: !quiet, shouldPlaySound: !quiet, shouldSetBadge: false };
}

let started = false;
let stops: (() => void)[] = [];


/**
 * Start once the local database is ready (root layout). Handles a response that launched the
 * app, then listens for more, and keeps the schedule + widgets in sync with local data.
 */
export function startNotifications(deps: ResponseDeps = defaultDeps): () => void {
  if (started) return stopNotifications;
  started = true;

  // Show reminders while the app is open too, except the duplicate "Rest over" (N5).
  Notifications.setNotificationHandler({
    handleNotification: async (n) =>
      foregroundBehavior(n.request.content.data, AppState.currentState === 'active'),
  });

  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    void handleResponse(r, deps);
  });
  stops.push(() => sub.remove());
  try {
    const last = Notifications.getLastNotificationResponse();
    if (last) {
      void handleResponse(last, deps).finally(() => {
        try {
          Notifications.clearLastNotificationResponse();
        } catch {
          // older native module: handled-keys de-dupe still protects us
        }
      });
    }
  } catch {
    // not available on this platform
  }

  // A logged set changes nothing a reminder or widget shows (they read sessions, exercises and
  // meals), so set writes never trigger a rebuild mid-rest (perf audit A10); finishing the workout
  // writes `sessions` and rebuilds once.
  stops.push(
    onLocalWrite((table) => {
      if (!IGNORED_WRITE_TABLES.has(table)) requestRebuild();
    }),
  );
  stops.push(useNotificationPrefs.subscribe(() => requestRebuild(300)));
  stops.push(
    useBillingStore.subscribe((s, prev) => {
      if (s.entitlement !== prev.entitlement || s.paymentsEnabled !== prev.paymentsEnabled) requestRebuild();
    }),
  );
  const app: NativeEventSubscription = AppState.addEventListener('change', (s) => {
    // Coming back: the date or time zone may have changed, and permission may have been toggled.
    if (s === 'active') requestRebuild(500);
  });
  stops.push(() => app.remove());

  void ensureChannels().catch(() => undefined);
  requestRebuild(FIRST_REBUILD_DELAY_MS);
  return stopNotifications;
}

export function stopNotifications(): void {
  for (const s of stops) s();
  stops = [];
  started = false;
  if (timer) clearTimeout(timer);
  timer = null;
}

/** Tests only. */
export function resetNotificationsForTests(): void {
  stopNotifications();
  channelsReady = null;
  rebuilding = null;
  rebuildAgain = false;
  kv.remove(K.stored);
  kv.remove(K.handled);
  useNotificationsStore.setState({ permission: 'unknown', canAskAgain: true, scheduled: [], status: 'idle', error: null });
}
