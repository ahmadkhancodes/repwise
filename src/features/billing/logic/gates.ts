/**
 * Free vs Pro gates (sheet 05 "Free vs Pro", sheet 09 F-S5). Pure. Every gate opens the
 * contextual "Hit a Pro limit" sheet with `paywall_view{source: 'gate:<feature>'}`; "Not now"
 * always returns the user to where they were (never a dead end).
 */
export type GateFeature =
  | 'meal_swap'
  | 'ate_out'
  | 'meal_week'
  | 'adaptive_plan'
  | 'routines'
  | 'grocery'
  | 'checkin'
  | 'assistant'
  | 'history'
  | 'progress'
  | 'body'
  | 'photos'
  | 'records'
  | 'notifications';

export type GateCopy = {
  /** Sheet title: the exact benefit, in context. */
  title: string;
  /** One calm line: what Free keeps, what Pro adds. */
  body: string;
  /** The preview: 2–3 concrete things this unlocks. */
  preview: string[];
};

export const GATES: Record<GateFeature, GateCopy> = {
  meal_swap: {
    title: 'Swap any meal',
    body: 'Not feeling it? Pro swaps a meal for one that fits the same calories and protein.',
    preview: ['Close matches for every meal', 'Your day stays on target', 'Unlimited swaps'],
  },
  ate_out: {
    title: 'Ate out? Stay on track',
    body: 'Log a meal out and Pro rebalances the rest of your day around it.',
    preview: ['Estimate any meal out', 'Remaining meals adjust', 'Targets stay on track'],
  },
  meal_week: {
    title: 'Plan the whole week',
    body: "Today's meals are free. Pro plans every day, never the same menu twice.",
    preview: ['A fresh menu every day', 'Swaps and recipes', 'Weekly grocery list'],
  },
  adaptive_plan: {
    title: 'A plan that adapts every week',
    body: 'Your first week is free. Pro adds weight, sets and new sessions as you get stronger.',
    preview: ['Auto-progression', 'Exercise swaps', 'Never the same session twice'],
  },
  routines: {
    title: 'Build every routine you want',
    body: 'Free keeps 3 custom routines. Pro has no limit.',
    preview: ['Unlimited routines', 'Programs library', 'Full history'],
  },
  grocery: {
    title: 'Your grocery list, done',
    body: "Pro turns the week's meals into one list, grouped by aisle.",
    preview: ['Auto-grouped by aisle', 'Tick as you shop', 'Updates with swaps'],
  },
  checkin: {
    title: 'A plan that adapts every week',
    body: 'Pro reads your week and adjusts calories, volume and menus for you.',
    preview: ['Calories adjust to your trend', 'Volume follows your progress', 'Menus stay fresh'],
  },
  assistant: {
    title: 'Every tip, every day',
    body: 'Free shows 1 assistant card a day. Pro shows them all.',
    preview: ['All assistant cards', 'Weekly check-in', 'Auto-adjust'],
  },
  history: {
    title: 'Every workout, all-time',
    body: 'Free keeps the last 30 days. Pro keeps everything.',
    preview: ['Full workout history', 'Every record', 'Monthly Wrapped'],
  },
  progress: {
    title: 'See every month add up',
    body: 'Free shows the last 30 days. Pro shows your whole journey.',
    preview: ['Full charts and heatmap', 'Monthly Wrapped', 'Progress photos'],
  },
  body: {
    title: 'Track every measurement',
    body: 'Free shows 30 days of weight. Pro keeps every measurement, all-time.',
    preview: ['Full weight trend', 'Body measurements', 'Progress photos'],
  },
  photos: {
    title: 'See the change, side by side',
    body: 'Pro keeps private progress photos on your phone and compares them.',
    preview: ['Side-by-side compare', 'Stored on your phone', 'Full history'],
  },
  records: {
    title: 'Every record, every lift',
    body: 'Free shows the last 30 days. Pro shows every lift, all-time.',
    preview: ['All-time records', 'Full charts', 'Every exercise'],
  },
  notifications: {
    title: 'Your day, planned and on time',
    body: 'Free reminds you to train. Pro adds meal times and pre/post-workout nudges.',
    preview: ['Meal time reminders', 'Pre- and post-workout', 'Morning brief'],
  },
};

export function gateSource(feature: GateFeature): `gate:${GateFeature}` {
  return `gate:${feature}`;
}

export function isGateFeature(v: unknown): v is GateFeature {
  return typeof v === 'string' && v in GATES;
}

/** Free users see only today's meal plan (sheet 05: "Today only (preview)"). */
export function canViewMealDay(isPro: boolean, date: string, today: string): boolean {
  return isPro || date === today;
}

/** Meal swaps and the 'ate out' rebalance are Pro (sheet 05). */
export function canSwapMeal(isPro: boolean): boolean {
  return isPro;
}

export function canLogAteOut(isPro: boolean): boolean {
  return isPro;
}

/**
 * The adaptive weekly plan (AI picks, auto-progression) is free for the first plan week only
 * (sheet 05: "First week only"). `firstWeekStart` is the week the user's first plan started.
 */
export function canAdaptPlan(
  isPro: boolean,
  weekStart: string,
  firstWeekStart: string | null,
): boolean {
  return isPro || firstWeekStart === null || weekStart <= firstWeekStart;
}

/** CTA on the gate sheet: trial wording only while a trial is on offer (F-S5 "already used trial"). */
export function gateCta(trialDays: number): string {
  return trialDays > 0 ? 'Start free trial' : 'See plans';
}
