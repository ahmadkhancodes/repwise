/**
 * Notification action buttons → what the app does (pure). The executor in
 * src/services/notifications.ts runs the result; this file has no native imports so it is
 * fully unit tested.
 */
import type { CategoryId, ChannelId, NotificationData } from './schedule';

/** expo-notifications' id for a plain tap on the notification body. */
export const DEFAULT_ACTION = 'expo.modules.notifications.actions.DEFAULT';

export const ACTIONS = {
  ate: 'ate',
  swap: 'swap',
  start: 'start',
  snooze: 'snooze',
  manage: 'manage',
  checkin: 'checkin',
} as const;
export type ActionId = (typeof ACTIONS)[keyof typeof ACTIONS];

export const SNOOZE_MIN = 10;

/**
 * Buttons per category (sheet 17). Every button opens the app (`opensAppToForeground`), so
 * the response reaches JS even when the app was killed (read with getLastNotificationResponse).
 */
export const CATEGORY_ACTIONS: Record<CategoryId, { id: ActionId; title: string }[]> = {
  meal: [
    { id: ACTIONS.ate, title: 'Ate it' },
    { id: ACTIONS.swap, title: 'Swap' },
    { id: ACTIONS.snooze, title: `Snooze ${SNOOZE_MIN} min` },
  ],
  workout: [
    { id: ACTIONS.start, title: 'Start' },
    { id: ACTIONS.snooze, title: `Snooze ${SNOOZE_MIN} min` },
  ],
  checkin: [{ id: ACTIONS.checkin, title: 'Start' }],
  trial: [{ id: ACTIONS.manage, title: 'Manage' }],
  open: [],
};

export type ResponseInput = {
  actionIdentifier: string;
  /** OS request identifier (our `key`). */
  identifier: string;
  title: string | null;
  body: string | null;
  data: unknown;
  /** When the notification was delivered (ms). */
  date: number;
};

export type SnoozeContent = {
  title: string;
  body: string;
  data: NotificationData;
  channelId: ChannelId;
  categoryId: CategoryId;
};

export type NotificationIntent =
  | { type: 'logMeal'; mealId: string; slot?: string; then: string }
  | { type: 'navigate'; url: string }
  | { type: 'snooze'; minutes: number; key: string; content: SnoozeContent }
  | { type: 'none' };

const KINDS = ['brief', 'meal', 'workout', 'fuel', 'evening', 'checkin', 'trial', 'snooze', 'rest'];

/** Validate the data payload (it round-trips through the OS, so never trust its shape). */
export function parseData(raw: unknown): NotificationData | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.kind !== 'string' || !KINDS.includes(d.kind)) return null;
  const url = typeof d.url === 'string' && d.url.startsWith('/') ? d.url : '/today';
  const str = (v: unknown) => (typeof v === 'string' && v.length > 0 && v.length < 200 ? v : undefined);
  return {
    kind: d.kind as NotificationData['kind'],
    url,
    mealId: str(d.mealId),
    sessionId: str(d.sessionId),
    date: str(d.date),
    slot: str(d.slot),
  };
}

function withParams(path: string, params: Record<string, string | undefined>): string {
  const q = Object.entries(params)
    .filter((e): e is [string, string] => e[1] != null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  if (!q) return path;
  return path.includes('?') ? `${path}&${q}` : `${path}?${q}`;
}

function channelFor(kind: NotificationData['kind']): ChannelId {
  if (kind === 'meal' || kind === 'fuel') return 'meals';
  if (kind === 'workout') return 'training';
  if (kind === 'checkin') return 'checkin';
  if (kind === 'trial') return 'account';
  return 'brief';
}

function categoryFor(kind: NotificationData['kind']): CategoryId {
  if (kind === 'meal') return 'meal';
  if (kind === 'workout') return 'workout';
  if (kind === 'checkin') return 'checkin';
  if (kind === 'trial') return 'trial';
  return 'open';
}

/** Route for a workout notification: the Train tab opens the session (workout agent contract). */
export function workoutUrl(sessionId: string | undefined, start: boolean): string {
  return withParams('/train', { sessionId, start: start ? '1' : undefined });
}

export function resolveResponse(r: ResponseInput): NotificationIntent {
  const data = parseData(r.data);
  if (!data) return r.actionIdentifier === DEFAULT_ACTION ? { type: 'navigate', url: '/today' } : { type: 'none' };
  // A snoozed reminder behaves like the original it copies.
  const kind = data.kind;

  switch (r.actionIdentifier) {
    case ACTIONS.ate:
      if (!data.mealId) return { type: 'navigate', url: '/eat' };
      return {
        type: 'logMeal',
        mealId: data.mealId,
        slot: data.slot,
        then: withParams('/eat', { mealId: data.mealId, logged: '1' }),
      };
    case ACTIONS.swap:
      return { type: 'navigate', url: withParams('/eat', { mealId: data.mealId, swap: '1' }) };
    case ACTIONS.start:
      return { type: 'navigate', url: workoutUrl(data.sessionId, true) };
    case ACTIONS.checkin:
      return { type: 'navigate', url: '/today?checkin=1' };
    case ACTIONS.manage:
      return { type: 'navigate', url: '/settings/subscription' };
    case ACTIONS.snooze: {
      const original = kind === 'snooze' ? (data.slot ? 'meal' : 'workout') : kind;
      return {
        type: 'snooze',
        minutes: SNOOZE_MIN,
        key: `rw:snooze:${r.identifier.replace(/^rw:snooze:/, '')}`,
        content: {
          title: r.title ?? '',
          body: r.body ?? '',
          data: { ...data, kind: original },
          channelId: channelFor(original),
          categoryId: categoryFor(original),
        },
      };
    }
    case DEFAULT_ACTION:
    default:
      if (kind === 'workout' || (kind === 'rest' && data.sessionId)) {
        return { type: 'navigate', url: workoutUrl(data.sessionId, false) };
      }
      if ((kind === 'meal' || kind === 'fuel') && data.mealId) {
        return { type: 'navigate', url: withParams('/eat', { mealId: data.mealId }) };
      }
      return { type: 'navigate', url: data.url };
  }
}

/** One response is handled once, even if the listener and the cold-start read both see it. */
export function responseKey(r: Pick<ResponseInput, 'identifier' | 'actionIdentifier' | 'date'>): string {
  return `${r.identifier}|${r.actionIdentifier}|${r.date}`;
}
