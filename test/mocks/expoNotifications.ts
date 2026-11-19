/**
 * In-memory expo-notifications double: scheduled requests, permission, channels, categories,
 * response listeners and the "last response" a cold start reads. Use with
 * `jest.mock('expo-notifications', () => require('../../../test/mocks/expoNotifications'))`.
 */
type Req = { identifier: string; content: Record<string, unknown>; trigger: Record<string, unknown> };
type Listener = (r: unknown) => void;

export const __state = {
  scheduled: new Map<string, Req>(),
  permission: { granted: true, status: 'granted', canAskAgain: true } as Record<string, unknown>,
  requestResult: { granted: true, status: 'granted', canAskAgain: true } as Record<string, unknown>,
  channels: new Map<string, Record<string, unknown>>(),
  categories: new Map<string, unknown[]>(),
  listeners: new Set<Listener>(),
  last: null as unknown,
  handler: null as unknown,
  dismissed: [] as string[],
  failSchedule: false,
  reset() {
    this.scheduled.clear();
    this.permission = { granted: true, status: 'granted', canAskAgain: true };
    this.requestResult = { granted: true, status: 'granted', canAskAgain: true };
    this.channels.clear();
    this.categories.clear();
    this.listeners.clear();
    this.last = null;
    this.dismissed = [];
    this.failSchedule = false;
  },
  emit(r: unknown) {
    for (const l of [...this.listeners]) l(r);
  },
};

export enum AndroidImportance {
  UNKNOWN = 0,
  UNSPECIFIED = 1,
  NONE = 2,
  MIN = 3,
  LOW = 4,
  DEFAULT = 5,
  HIGH = 6,
  MAX = 7,
}
export enum AndroidNotificationVisibility {
  UNKNOWN = 0,
  PUBLIC = 1,
  PRIVATE = 2,
  SECRET = 3,
}
export enum SchedulableTriggerInputTypes {
  CALENDAR = 'calendar',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
  DATE = 'date',
  TIME_INTERVAL = 'timeInterval',
}
export const DEFAULT_ACTION_IDENTIFIER = 'expo.modules.notifications.actions.DEFAULT';

export const scheduleNotificationAsync = jest.fn(async (req: Req) => {
  if (__state.failSchedule) throw new Error('schedule failed');
  __state.scheduled.set(req.identifier, req);
  return req.identifier;
});
export const cancelScheduledNotificationAsync = jest.fn(async (id: string) => {
  __state.scheduled.delete(id);
});
export const getAllScheduledNotificationsAsync = jest.fn(async () => [...__state.scheduled.values()]);
export const getPermissionsAsync = jest.fn(async () => ({ ...__state.permission }));
export const requestPermissionsAsync = jest.fn(async () => {
  __state.permission = { ...__state.requestResult };
  return { ...__state.requestResult };
});
export const setNotificationChannelAsync = jest.fn(async (id: string, c: Record<string, unknown>) => {
  __state.channels.set(id, c);
  return c;
});
export const setNotificationCategoryAsync = jest.fn(async (id: string, actions: unknown[]) => {
  __state.categories.set(id, actions);
  return { identifier: id, actions };
});
export const setNotificationHandler = jest.fn((h: unknown) => {
  __state.handler = h;
});
export const addNotificationResponseReceivedListener = jest.fn((l: Listener) => {
  __state.listeners.add(l);
  return { remove: () => __state.listeners.delete(l) };
});
export const getLastNotificationResponse = jest.fn(() => __state.last);
export const clearLastNotificationResponse = jest.fn(() => {
  __state.last = null;
});
export const dismissNotificationAsync = jest.fn(async (id: string) => {
  __state.dismissed.push(id);
});

/** A response as expo-notifications delivers it. */
export function makeResponse(
  identifier: string,
  actionIdentifier: string,
  data: Record<string, unknown>,
  date = 1_000,
  content: { title?: string; body?: string } = {},
) {
  return {
    actionIdentifier,
    notification: {
      date,
      request: {
        identifier,
        content: { title: content.title ?? 'Lunch time 🍽', body: content.body ?? 'Bowl · 600 kcal', data },
        trigger: null,
      },
    },
  };
}
