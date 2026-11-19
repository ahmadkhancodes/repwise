import { parseHm } from './zonedTime';

/** Meal slots, in day order (matches `SLOT_ORDER` in src/features/meals/repo.ts). */
export const MEAL_SLOTS = ['breakfast', 'lunch', 'snack', 'dinner'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

/** Per-device notification preferences (MMKV; not synced — reminders are a device choice). */
export type NotificationPrefs = {
  /** N-1 morning brief (wake time + 15 min). */
  brief: boolean;
  /** N-2 each planned meal at its slot time. */
  meals: boolean;
  /** N-3 workout reminder before the training time. */
  workout: boolean;
  /** N-4 "Fuel up" snack before training. */
  fuel: boolean;
  /** Evening preview of tomorrow (core loop). */
  evening: boolean;
  /** N-6 weekly check-in. */
  checkin: boolean;
  /** N-T5 trial ends in 2 days. */
  trial: boolean;
  /** "HH:mm" local. The brief fires 15 minutes later. */
  wakeTime: string;
  /** "HH:mm" local start of training. */
  workoutTime: string;
  /** Minutes before `workoutTime` for N-3. */
  workoutLeadMin: number;
  eveningTime: string;
  /** 0 = Sunday (sheet 17) … 6 = Saturday. */
  checkinDay: number;
  checkinTime: string;
  quietEnabled: boolean;
  /** Quiet hours, "HH:mm" local; may wrap midnight. Default 22:00–07:00 (sheet 17). */
  quietStart: string;
  quietEnd: string;
  /** Meal time overrides set on the Notifications screen ("HH:mm"); else profile, else defaults. */
  mealTimes: Partial<Record<MealSlot, string>>;
};

export const DEFAULT_MEAL_TIMES: Record<MealSlot, string> = {
  breakfast: '08:00',
  lunch: '13:00',
  snack: '16:30',
  dinner: '19:30',
};

export const DEFAULT_PREFS: NotificationPrefs = {
  brief: true,
  meals: true,
  workout: true,
  fuel: true,
  evening: true,
  checkin: true,
  trial: true,
  wakeTime: '07:00',
  workoutTime: '18:00',
  workoutLeadMin: 30,
  eveningTime: '20:30',
  checkinDay: 0,
  checkinTime: '18:00',
  quietEnabled: true,
  quietStart: '22:00',
  quietEnd: '07:00',
  mealTimes: {},
};

/** Kinds a free user gets (RW-43 "Free limited; Pro"). While payments are off everyone is Pro. */
export const FREE_KINDS = ['brief', 'workout', 'checkin', 'trial'] as const;
export const PRO_KINDS = ['meals', 'fuel', 'evening'] as const;
export type PrefKind = (typeof FREE_KINDS)[number] | (typeof PRO_KINDS)[number];

const BOOL_KEYS = ['brief', 'meals', 'workout', 'fuel', 'evening', 'checkin', 'trial', 'quietEnabled'] as const;
const TIME_KEYS = ['wakeTime', 'workoutTime', 'eveningTime', 'checkinTime', 'quietStart', 'quietEnd'] as const;

/** Merge stored JSON with defaults, dropping anything invalid (never crash on a bad value). */
export function sanitizePrefs(raw: unknown): NotificationPrefs {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: NotificationPrefs = { ...DEFAULT_PREFS, mealTimes: {} };
  for (const k of BOOL_KEYS) if (typeof src[k] === 'boolean') out[k] = src[k] as boolean;
  for (const k of TIME_KEYS) {
    const v = src[k];
    if (typeof v === 'string' && parseHm(v) != null) out[k] = v;
  }
  const lead = src.workoutLeadMin;
  if (typeof lead === 'number' && Number.isInteger(lead) && lead >= 0 && lead <= 180) out.workoutLeadMin = lead;
  const day = src.checkinDay;
  if (typeof day === 'number' && Number.isInteger(day) && day >= 0 && day <= 6) out.checkinDay = day;
  const mt = src.mealTimes;
  if (mt && typeof mt === 'object') {
    for (const slot of MEAL_SLOTS) {
      const v = (mt as Record<string, unknown>)[slot];
      if (typeof v === 'string' && parseHm(v) != null) out.mealTimes[slot] = v;
    }
  }
  return out;
}

function isSlot(s: string): s is MealSlot {
  return (MEAL_SLOTS as readonly string[]).includes(s);
}

/**
 * `profile.meal_times` → slot times. Accepts "breakfast=08:00" / "breakfast@08:00" /
 * "breakfast 08:00", or plain "HH:mm" entries matched to the slots in day order
 * (3 entries = breakfast, lunch, dinner; 4 = all slots).
 */
export function parseProfileMealTimes(raw: unknown): Partial<Record<MealSlot, string>> {
  if (!Array.isArray(raw)) return {};
  const out: Partial<Record<MealSlot, string>> = {};
  const plain: string[] = [];
  for (const e of raw) {
    if (typeof e !== 'string') continue;
    const named = /^([a-z]+)\s*[=@ ]\s*(\d{1,2}:\d{2})$/i.exec(e.trim());
    if (named) {
      const slot = named[1]!.toLowerCase();
      if (isSlot(slot) && parseHm(named[2]) != null) out[slot] = named[2]!;
    } else if (parseHm(e) != null) {
      plain.push(e.trim());
    }
  }
  if (plain.length && !Object.keys(out).length) {
    const order: readonly MealSlot[] =
      plain.length >= 4 ? MEAL_SLOTS : plain.length === 3 ? ['breakfast', 'lunch', 'dinner'] : ['lunch', 'dinner'];
    order.forEach((slot, i) => {
      if (plain[i]) out[slot] = plain[i];
    });
  }
  return out;
}

/** Final slot times: screen overrides › profile › defaults. */
export function resolveMealTimes(
  prefs: NotificationPrefs,
  profileMealTimes: unknown,
): Record<MealSlot, string> {
  return { ...DEFAULT_MEAL_TIMES, ...parseProfileMealTimes(profileMealTimes), ...prefs.mealTimes };
}
