/**
 * Allergen vocabulary bridge. Content recipes use the EU-14 names (milk, eggs, soybeans …); the
 * engine and onboarding may use the short names (dairy, egg, soy …). Everything is normalised to
 * the EU-14 content names so a user allergy is never lost in translation (stricter, never looser).
 */
import type { Recipe } from '@repwise/content';

export type ContentAllergen = Recipe['allergens'][number];

const ALIASES: Record<string, ContentAllergen[]> = {
  celery: ['celery'],
  gluten: ['gluten'],
  wheat: ['gluten'],
  crustaceans: ['crustaceans'],
  molluscs: ['molluscs'],
  shellfish: ['crustaceans', 'molluscs'],
  eggs: ['eggs'],
  egg: ['eggs'],
  fish: ['fish'],
  lupin: ['lupin'],
  milk: ['milk'],
  dairy: ['milk'],
  lactose: ['milk'],
  mustard: ['mustard'],
  nuts: ['nuts'],
  tree_nuts: ['nuts'],
  peanuts: ['peanuts'],
  peanut: ['peanuts'],
  sesame: ['sesame'],
  soybeans: ['soybeans'],
  soy: ['soybeans'],
  soya: ['soybeans'],
  sulphites: ['sulphites'],
  sulfites: ['sulphites'],
};

/** Any spelling (content, engine, onboarding) → the EU-14 content names. Unknown values are dropped. */
export function normaliseAllergies(input: readonly string[] | null | undefined): ContentAllergen[] {
  const out = new Set<ContentAllergen>();
  for (const raw of input ?? []) {
    const key = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
    for (const a of ALIASES[key] ?? []) out.add(a);
  }
  return [...out];
}

/** Content allergen → engine allergen spelling (current engine vocabulary). */
export const CONTENT_TO_ENGINE_ALLERGEN: Record<ContentAllergen, string> = {
  celery: 'celery',
  gluten: 'gluten',
  crustaceans: 'shellfish',
  eggs: 'egg',
  fish: 'fish',
  lupin: 'lupin',
  milk: 'dairy',
  molluscs: 'shellfish',
  mustard: 'mustard',
  nuts: 'nuts',
  peanuts: 'peanut',
  sesame: 'sesame',
  soybeans: 'soy',
  sulphites: 'sulphites',
};

/** Allergens of the recipe the user is allergic to (empty = safe). */
export function allergenHits(
  recipe: Pick<Recipe, 'allergens'>,
  allergies: readonly ContentAllergen[],
): ContentAllergen[] {
  return recipe.allergens.filter((a) => allergies.includes(a));
}

/** Short readable label for chips ("Milk", "Soy"). */
export function allergenLabel(a: ContentAllergen): string {
  const labels: Partial<Record<ContentAllergen, string>> = {
    soybeans: 'Soy',
    crustaceans: 'Crustaceans',
    molluscs: 'Molluscs',
  };
  return labels[a] ?? a.charAt(0).toUpperCase() + a.slice(1);
}
