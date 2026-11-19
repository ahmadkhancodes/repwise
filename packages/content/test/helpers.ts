export * from '../src/index';

/** Per-serving kcal sanity ranges by slot (content QA, not nutrition advice). */
export const MEAL_SLOTS_SANITY = {
  breakfast: [200, 700],
  lunch: [250, 950],
  dinner: [250, 950],
  snack: [80, 450],
} as const;
