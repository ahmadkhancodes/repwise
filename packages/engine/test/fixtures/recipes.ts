/**
 * Small generated fixture recipe catalogue (shape = RecipeSchema). Nutrition is computed from
 * ingredient grams × per-100 g values (approximate USDA-style numbers), as the real pipeline does.
 * Not real content.
 */
import { RecipeCatalogueSchema, type Allergen, type Cuisine, type DietTag, type MealSlot, type ProteinSource, type Recipe, type RecipeInput } from '../../src';

interface Food {
  name: string;
  kcal: number;
  p: number;
  c: number;
  f: number;
  fibre?: number;
  allergens?: Allergen[];
  /** animal = meat; fish; dairy/egg = vegetarian; plant */
  kind: 'meat' | 'fish' | 'shellfish' | 'dairy' | 'egg' | 'plant';
  aisle: string;
}

const FOODS: Record<string, Food> = {
  chicken_breast: { name: 'Chicken breast', kcal: 165, p: 31, c: 0, f: 3.6, kind: 'meat', aisle: 'meat' },
  turkey_mince: { name: 'Lean turkey mince', kcal: 130, p: 22, c: 0, f: 4.5, kind: 'meat', aisle: 'meat' },
  beef_lean: { name: 'Lean beef', kcal: 137, p: 21, c: 0, f: 5.5, kind: 'meat', aisle: 'meat' },
  lamb_lean: { name: 'Lean lamb', kcal: 190, p: 25, c: 0, f: 9.5, kind: 'meat', aisle: 'meat' },
  salmon: { name: 'Salmon fillet', kcal: 208, p: 20, c: 0, f: 13, allergens: ['fish'], kind: 'fish', aisle: 'fish' },
  white_fish: { name: 'White fish', kcal: 82, p: 18, c: 0, f: 0.7, allergens: ['fish'], kind: 'fish', aisle: 'fish' },
  tuna: { name: 'Tuna in water', kcal: 116, p: 26, c: 0, f: 1, allergens: ['fish'], kind: 'fish', aisle: 'tins' },
  shrimp: { name: 'Prawns', kcal: 99, p: 24, c: 0, f: 0.3, allergens: ['shellfish'], kind: 'shellfish', aisle: 'fish' },
  egg: { name: 'Eggs', kcal: 143, p: 12.6, c: 0.7, f: 9.5, allergens: ['egg'], kind: 'egg', aisle: 'dairy' },
  paneer: { name: 'Paneer', kcal: 265, p: 18, c: 1.2, f: 21, allergens: ['dairy'], kind: 'dairy', aisle: 'dairy' },
  greek_yogurt: { name: 'Fat-free Greek yogurt', kcal: 59, p: 10, c: 3.6, f: 0.4, allergens: ['dairy'], kind: 'dairy', aisle: 'dairy' },
  cottage_cheese: { name: 'Low-fat cottage cheese', kcal: 72, p: 12.4, c: 2.7, f: 1, allergens: ['dairy'], kind: 'dairy', aisle: 'dairy' },
  feta: { name: 'Feta', kcal: 264, p: 14, c: 4, f: 21, allergens: ['dairy'], kind: 'dairy', aisle: 'dairy' },
  milk_skim: { name: 'Skimmed milk', kcal: 34, p: 3.4, c: 5, f: 0.1, allergens: ['dairy'], kind: 'dairy', aisle: 'dairy' },
  whey: { name: 'Whey protein', kcal: 400, p: 80, c: 8, f: 6, allergens: ['dairy'], kind: 'dairy', aisle: 'health' },
  tofu: { name: 'Firm tofu', kcal: 144, p: 17, c: 3, f: 9, allergens: ['soy'], kind: 'plant', aisle: 'chilled' },
  tempeh: { name: 'Tempeh', kcal: 192, p: 20, c: 7.6, f: 11, allergens: ['soy'], kind: 'plant', aisle: 'chilled' },
  seitan: { name: 'Seitan', kcal: 140, p: 25, c: 6, f: 2, allergens: ['gluten'], kind: 'plant', aisle: 'chilled' },
  lentils: { name: 'Cooked lentils', kcal: 116, p: 9, c: 20, f: 0.4, fibre: 8, kind: 'plant', aisle: 'tins' },
  chickpeas: { name: 'Cooked chickpeas', kcal: 164, p: 8.9, c: 27, f: 2.6, fibre: 7.6, kind: 'plant', aisle: 'tins' },
  edamame: { name: 'Edamame', kcal: 121, p: 12, c: 9, f: 5, allergens: ['soy'], kind: 'plant', aisle: 'frozen' },
  soy_protein: { name: 'Soy protein isolate', kcal: 335, p: 88, c: 0, f: 3.4, allergens: ['soy'], kind: 'plant', aisle: 'health' },
  pea_protein: { name: 'Pea protein', kcal: 380, p: 80, c: 5, f: 5, kind: 'plant', aisle: 'health' },
  soy_milk: { name: 'Soy milk', kcal: 33, p: 3.3, c: 1.2, f: 1.8, allergens: ['soy'], kind: 'plant', aisle: 'chilled' },
  rice: { name: 'Cooked rice', kcal: 130, p: 2.7, c: 28, f: 0.3, kind: 'plant', aisle: 'grains' },
  quinoa: { name: 'Cooked quinoa', kcal: 120, p: 4.4, c: 21, f: 1.9, fibre: 2.8, kind: 'plant', aisle: 'grains' },
  oats: { name: 'Oats', kcal: 389, p: 17, c: 66, f: 7, fibre: 10, allergens: ['gluten'], kind: 'plant', aisle: 'grains' },
  pasta: { name: 'Cooked wholewheat pasta', kcal: 124, p: 5, c: 25, f: 1, allergens: ['gluten'], kind: 'plant', aisle: 'grains' },
  potato: { name: 'Potato', kcal: 77, p: 2, c: 17, f: 0.1, kind: 'plant', aisle: 'produce' },
  sweet_potato: { name: 'Sweet potato', kcal: 86, p: 1.6, c: 20, f: 0.1, kind: 'plant', aisle: 'produce' },
  flatbread: { name: 'Wholewheat flatbread', kcal: 297, p: 11, c: 55, f: 4, allergens: ['gluten'], kind: 'plant', aisle: 'bakery' },
  tortilla: { name: 'Corn tortilla', kcal: 218, p: 5.7, c: 45, f: 2.9, kind: 'plant', aisle: 'bakery' },
  rice_noodles: { name: 'Cooked rice noodles', kcal: 108, p: 1.8, c: 24, f: 0.2, kind: 'plant', aisle: 'grains' },
  bread: { name: 'Wholegrain bread', kcal: 247, p: 13, c: 41, f: 3.4, allergens: ['gluten'], kind: 'plant', aisle: 'bakery' },
  broccoli: { name: 'Broccoli', kcal: 34, p: 2.8, c: 7, f: 0.4, kind: 'plant', aisle: 'produce' },
  spinach: { name: 'Spinach', kcal: 23, p: 2.9, c: 3.6, f: 0.4, kind: 'plant', aisle: 'produce' },
  peppers: { name: 'Mixed peppers', kcal: 31, p: 1, c: 6, f: 0.3, kind: 'plant', aisle: 'produce' },
  tomato: { name: 'Tomatoes', kcal: 18, p: 0.9, c: 3.9, f: 0.2, kind: 'plant', aisle: 'produce' },
  cucumber: { name: 'Cucumber', kcal: 15, p: 0.7, c: 3.6, f: 0.1, kind: 'plant', aisle: 'produce' },
  onion: { name: 'Onion', kcal: 40, p: 1.1, c: 9.3, f: 0.1, kind: 'plant', aisle: 'produce' },
  berries: { name: 'Mixed berries', kcal: 57, p: 0.7, c: 14, f: 0.3, kind: 'plant', aisle: 'produce' },
  banana: { name: 'Banana', kcal: 89, p: 1.1, c: 23, f: 0.3, kind: 'plant', aisle: 'produce' },
  apple: { name: 'Apple', kcal: 52, p: 0.3, c: 14, f: 0.2, kind: 'plant', aisle: 'produce' },
  avocado: { name: 'Avocado', kcal: 160, p: 2, c: 9, f: 15, kind: 'plant', aisle: 'produce' },
  olive_oil: { name: 'Olive oil', kcal: 884, p: 0, c: 0, f: 100, kind: 'plant', aisle: 'pantry' },
  almonds: { name: 'Almonds', kcal: 579, p: 21, c: 22, f: 50, allergens: ['nuts'], kind: 'plant', aisle: 'pantry' },
  peanut_butter: { name: 'Peanut butter', kcal: 588, p: 25, c: 20, f: 50, allergens: ['peanut'], kind: 'plant', aisle: 'pantry' },
  tahini: { name: 'Tahini', kcal: 595, p: 17, c: 21, f: 54, allergens: ['sesame'], kind: 'plant', aisle: 'pantry' },
  pumpkin_seeds: { name: 'Pumpkin seeds', kcal: 559, p: 30, c: 11, f: 49, kind: 'plant', aisle: 'pantry' },
  spice_mix: { name: 'Spice mix', kcal: 0, p: 0, c: 0, f: 0, kind: 'plant', aisle: 'pantry' },
};

const CUISINES: { id: Cuisine; adj: string; carbs: [string, string]; veg: string[] }[] = [
  { id: 'pakistani', adj: 'Karahi', carbs: ['rice', 'flatbread'], veg: ['tomato', 'onion'] },
  { id: 'indian', adj: 'Masala', carbs: ['rice', 'flatbread'], veg: ['spinach', 'onion'] },
  { id: 'arab', adj: "Za'atar", carbs: ['flatbread', 'rice'], veg: ['tomato', 'cucumber'] },
  { id: 'mediterranean', adj: 'Lemon-herb', carbs: ['quinoa', 'potato'], veg: ['peppers', 'tomato'] },
  { id: 'western', adj: 'Roast', carbs: ['potato', 'pasta'], veg: ['broccoli', 'peppers'] },
  { id: 'mexican', adj: 'Chipotle', carbs: ['tortilla', 'rice'], veg: ['peppers', 'onion'] },
  { id: 'thai', adj: 'Thai basil', carbs: ['rice_noodles', 'rice'], veg: ['broccoli', 'peppers'] },
];

const PROTEINS: { id: string; grams: number; source: ProteinSource; cost: 1 | 2 | 3 }[] = [
  { id: 'chicken_breast', grams: 150, source: 'chicken', cost: 2 },
  { id: 'turkey_mince', grams: 150, source: 'turkey', cost: 2 },
  { id: 'beef_lean', grams: 140, source: 'beef', cost: 2 },
  { id: 'lamb_lean', grams: 130, source: 'lamb', cost: 3 },
  { id: 'salmon', grams: 140, source: 'fish', cost: 3 },
  { id: 'white_fish', grams: 180, source: 'fish', cost: 2 },
  { id: 'shrimp', grams: 160, source: 'shellfish', cost: 3 },
  { id: 'egg', grams: 150, source: 'egg', cost: 1 },
  { id: 'paneer', grams: 100, source: 'dairy', cost: 2 },
  { id: 'tofu', grams: 200, source: 'tofu', cost: 1 },
  { id: 'tempeh', grams: 150, source: 'tempeh', cost: 2 },
  { id: 'seitan', grams: 160, source: 'seitan', cost: 2 },
  { id: 'lentils', grams: 250, source: 'legumes', cost: 1 },
  { id: 'chickpeas', grams: 220, source: 'legumes', cost: 1 },
];

const CARB_GRAMS: Record<string, number> = { rice: 180, quinoa: 180, pasta: 180, potato: 300, sweet_potato: 250, flatbread: 80, tortilla: 90, rice_noodles: 200, bread: 80 };

function build(
  id: string,
  name: string,
  cuisine: Cuisine,
  slots: MealSlot[],
  source: ProteinSource,
  cost: 1 | 2 | 3,
  prepMin: number,
  parts: [string, number][],
): RecipeInput {
  let kcal = 0, protein = 0, carbs = 0, fat = 0, fibre = 0;
  const allergens = new Set<Allergen>();
  const kinds = new Set<Food['kind']>();
  for (const [fid, g] of parts) {
    const f = FOODS[fid];
    if (!f) throw new Error(`unknown food ${fid}`);
    kcal += (f.kcal * g) / 100;
    protein += (f.p * g) / 100;
    carbs += (f.c * g) / 100;
    fat += (f.f * g) / 100;
    fibre += ((f.fibre ?? 0) * g) / 100;
    f.allergens?.forEach((a) => allergens.add(a));
    kinds.add(f.kind);
  }
  const tags: DietTag[] = ['halal'];
  const animal = kinds.has('meat') || kinds.has('fish') || kinds.has('shellfish');
  if (!animal && !kinds.has('dairy') && !kinds.has('egg')) tags.push('vegan', 'vegetarian');
  else if (!animal) tags.push('vegetarian');
  if (!kinds.has('meat')) tags.push('pescatarian');
  if ((4 * protein) / kcal >= 0.3) tags.push('high_protein');
  if ((4 * carbs) / kcal <= 0.1) tags.push('keto', 'low_carb');
  if (!allergens.has('gluten')) tags.push('gluten_free');
  if (!allergens.has('dairy')) tags.push('dairy_free');
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return {
    id,
    name,
    cuisine,
    slots,
    dietTags: tags,
    allergens: [...allergens],
    proteinSource: source,
    ingredients: parts.map(([fid, g]) => ({ id: fid, name: (FOODS[fid] as Food).name, grams: g, aisle: (FOODS[fid] as Food).aisle })),
    perServing: { kcal: Math.round(kcal), protein: r1(protein), carbs: r1(carbs), fat: r1(fat), fibre: r1(fibre) },
    prepMin,
    costTier: cost,
    scalable: { min: 0.5, max: 3 },
    steps: ['Prep', 'Cook', 'Serve'],
  };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const pretty = (fid: string) => (FOODS[fid] as Food).name.toLowerCase();

export function buildRecipeInputs(): RecipeInput[] {
  const out: RecipeInput[] = [];
  CUISINES.forEach((cu, ci) => {
    // Mains (lunch + dinner)
    PROTEINS.forEach((pr, pi) => {
      cu.carbs.forEach((carb, k) => {
        const name = `${cu.adj} ${pretty(pr.id)} with ${pretty(carb)}`;
        out.push(
          build(slug(`${cu.id}_${pr.id}_${carb}`), name, cu.id, ['lunch', 'dinner'], pr.source, pr.cost, 15 + ((ci + pi + k) % 4) * 10, [
            [pr.id, pr.grams],
            [carb, CARB_GRAMS[carb] as number],
            [cu.veg[0] as string, 100],
            [cu.veg[1] as string, 50 + ci * 5],
            ['olive_oil', 8],
            ['spice_mix', 5],
          ]),
        );
      });
      // Low-carb main for animal proteins
      if (pi < 9) {
        out.push(
          build(slug(`${cu.id}_${pr.id}_greens`), `${cu.adj} ${pretty(pr.id)} with greens`, cu.id, ['lunch', 'dinner'], pr.source, pr.cost, 20, [
            [pr.id, pr.grams + 30],
            ['spinach', 100],
            ['broccoli', 100],
            ['avocado', 50],
            ['olive_oil', 10],
          ]),
        );
      }
    });
    // Breakfasts
    const b = (key: string, name: string, src: ProteinSource, cost: 1 | 2 | 3, parts: [string, number][]) =>
      out.push(build(slug(`${cu.id}_${key}`), `${cu.adj} ${name}`, cu.id, ['breakfast'], src, cost, 10, parts));
    const v = 1 + (ci % 3) * 0.1;
    b('egg_scramble', 'egg scramble on toast', 'egg', 1, [['egg', 150], ['bread', 60], ['spinach', 50 * v], ['olive_oil', 5]]);
    b('yogurt_bowl', 'yogurt bowl', 'dairy', 1, [['greek_yogurt', 250], ['oats', 40], ['berries', 100 * v]]);
    b('protein_oats', 'protein oats', 'protein_powder', 2, [['oats', 60], ['whey', 30], ['milk_skim', 200], ['banana', 80 * v]]);
    b('tofu_scramble', 'tofu scramble on toast', 'tofu', 1, [['tofu', 200], ['bread', 60], ['peppers', 80 * v], ['olive_oil', 5]]);
    b('soy_oats', 'soy protein oats', 'protein_powder', 1, [['oats', 60], ['soy_protein', 30], ['soy_milk', 250], ['berries', 80 * v]]);
    b('cottage_toast', 'cottage cheese toast', 'dairy', 1, [['cottage_cheese', 200], ['bread', 60], ['tomato', 80 * v]]);
    b('pea_quinoa_bowl', 'pea protein quinoa bowl', 'protein_powder', 2, [['quinoa', 150], ['pea_protein', 30], ['berries', 100 * v], ['pumpkin_seeds', 15]]);
    b('egg_avocado', 'eggs and avocado', 'egg', 1, [['egg', 150], ['avocado', 70], ['spinach', 60 * v]]);
    // Snacks
    const s = (key: string, name: string, src: ProteinSource, cost: 1 | 2 | 3, parts: [string, number][]) =>
      out.push(build(slug(`${cu.id}_snack_${key}`), `${cu.adj} ${name}`, cu.id, ['snack'], src, cost, 5, parts));
    s('yogurt_berries', 'yogurt and berries', 'dairy', 1, [['greek_yogurt', 200], ['berries', 80 * v]]);
    s('cottage_fruit', 'cottage cheese and apple', 'dairy', 1, [['cottage_cheese', 150], ['apple', 120 * v]]);
    s('whey_shake', 'whey shake and banana', 'protein_powder', 2, [['whey', 30], ['milk_skim', 250], ['banana', 100 * v]]);
    s('soy_shake', 'soy shake and apple', 'protein_powder', 1, [['soy_protein', 30], ['soy_milk', 250], ['apple', 120 * v]]);
    s('pea_shake', 'pea protein shake', 'protein_powder', 1, [['pea_protein', 30], ['banana', 100 * v]]);
    s('hummus', 'hummus plate', 'legumes', 1, [['chickpeas', 120], ['tahini', 10], ['cucumber', 100 * v], ['flatbread', 30]]);
    s('roast_chickpeas', 'roasted chickpeas', 'legumes', 1, [['chickpeas', 150 * v], ['olive_oil', 5]]);
    s('edamame', 'edamame bowl', 'legumes', 1, [['edamame', 150 * v]]);
    s('eggs_apple', 'boiled eggs and apple', 'egg', 1, [['egg', 100], ['apple', 120 * v]]);
    s('tuna_cucumber', 'tuna cucumber bites', 'fish', 1, [['tuna', 100], ['cucumber', 120 * v], ['tortilla', 25]]);
    s('seed_fruit', 'seeds and fruit', 'none', 1, [['pumpkin_seeds', 20], ['apple', 150 * v]]);
    s('pb_toast', 'peanut butter toast', 'none', 1, [['bread', 40], ['peanut_butter', 15], ['banana', 60 * v]]);
  });
  return out;
}

export const recipeInputs = buildRecipeInputs();
export const recipes: Recipe[] = RecipeCatalogueSchema.parse(recipeInputs);
