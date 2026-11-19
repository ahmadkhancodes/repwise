import { isSensitiveKey, keyWords, MAX_STRING_PROP, sanitizeProps } from '../analyticsGuard';

it('splits snake, camel and kebab keys into words', () => {
  expect(keyWords('bodyWeight_kg')).toEqual(['body', 'weight', 'kg']);
  expect(keyWords('diet-type')).toEqual(['diet', 'type']);
});

it('flags health values, personal data and free text keys', () => {
  for (const k of ['weight', 'weightKg', 'kcal', 'protein_g', 'carbs', 'fat', 'macros', 'waist_cm', 'bodyFat', 'bmi', 'age', 'email', 'meal_name', 'prompt', 'note'])
    expect(isSensitiveKey(k)).toBe(true);
  for (const k of ['goal', 'days', 'diet_type', 'slot', 'from_plan', 'sets', 'prs', 'duration_bucket', 'page', 'stage', 'source', 'plan'])
    expect(isSensitiveKey(k)).toBe(false);
});

it('strips health values but keeps categories, counts and sheet-23 buckets', () => {
  expect(
    sanitizeProps({
      goal: 'fat_loss',
      days: 4,
      from_plan: true,
      slot: null,
      weight: 82.5,
      kcal: 2100,
      protein_g: 160,
      chest_cm: 101,
      kcal_change_bucket: 'down_small',
      kcal_bucket: 2100, // a bucket must be a category string
      meal_name: 'Chicken bowl',
    }),
  ).toEqual({ goal: 'fat_loss', days: 4, from_plan: true, slot: null, kcal_change_bucket: 'down_small' });
});

it('drops objects, non-finite numbers and long free text; tolerates junk input', () => {
  expect(
    sanitizeProps({ nested: { a: 1 }, list: [1], n: NaN, inf: Infinity, s: 'x'.repeat(MAX_STRING_PROP + 1), ok: 'short', u: undefined }),
  ).toEqual({ ok: 'short' });
  expect(sanitizeProps(undefined)).toEqual({});
  expect(sanitizeProps(null)).toEqual({});
});
