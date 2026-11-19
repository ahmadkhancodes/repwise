/**
 * Privacy guard for analytics and crash breadcrumbs (sheet 23: "Never send body measurements,
 * meal text or AI prompts — only categories and counts"). Pure, so it is unit-tested.
 *
 * A prop is dropped when its key names a health value or personal/free text, when its value is
 * not a primitive, or when a string value is long enough to be free text. Sheet 23 allows
 * bucketed categories (e.g. `kcal_change_bucket: 'down_small'`), so a string `*_bucket` prop is
 * kept even when its key mentions kcal.
 */
/** Props that survive the guard: JSON primitives only (undefined values are dropped). */
export type CleanProps = Record<string, string | number | boolean | null>;

/** Words (after splitting snake_case / camelCase / kebab-case) that mark a sensitive key. */
const BLOCKED_WORDS = new Set([
  // body measurements
  'weight', 'kg', 'kgs', 'lb', 'lbs', 'bodyweight', 'bodyfat', 'body', 'bmi', 'height', 'cm',
  'waist', 'hip', 'hips', 'chest', 'neck', 'thigh', 'thighs', 'arm', 'arms', 'bicep', 'biceps',
  'calf', 'measurement', 'measurements', 'heart', 'bpm', 'hr', 'sleep', 'age', 'dob', 'birth',
  'birthday', 'birthdate', 'sex', 'gender',
  // nutrition values
  'kcal', 'calorie', 'calories', 'cal', 'kj', 'macro', 'macros', 'protein', 'carb', 'carbs',
  'fat', 'fats', 'fibre', 'fiber', 'sugar', 'sugars', 'sodium', 'salt',
  // personal data and free text (meal text, AI prompts, notes)
  'email', 'phone', 'name', 'firstname', 'lastname', 'address', 'text', 'prompt', 'note',
  'notes', 'query', 'message', 'comment', 'description', 'title', 'token', 'password',
]);

/** Longer strings are treated as free text and dropped (categories are short ids). */
export const MAX_STRING_PROP = 48;

export function keyWords(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function isSensitiveKey(key: string): boolean {
  return keyWords(key).some((w) => BLOCKED_WORDS.has(w));
}

function isAllowedBucket(key: string, value: unknown): boolean {
  const words = keyWords(key);
  return words[words.length - 1] === 'bucket' && typeof value === 'string';
}

/** Returns a copy of `props` with every sensitive or free-text value removed. Never throws. */
export function sanitizeProps(props: Record<string, unknown> | undefined | null): CleanProps {
  const out: CleanProps = {};
  if (!props || typeof props !== 'object') return out;
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) continue;
    if (value !== null) {
      const t = typeof value;
      if (t !== 'string' && t !== 'number' && t !== 'boolean') continue;
      if (t === 'number' && !Number.isFinite(value as number)) continue;
      if (t === 'string' && (value as string).length > MAX_STRING_PROP) continue;
    }
    if (isSensitiveKey(key) && !isAllowedBucket(key, value)) continue;
    out[key] = value as CleanProps[string];
  }
  return out;
}
