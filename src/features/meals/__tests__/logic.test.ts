import type { Food, Recipe } from '@repwise/content';

import { getCatalog } from '@/services/catalog';

import { allergenHits, allergenLabel, normaliseAllergies } from '../logic/allergens';
import { formatClock, formatDuration, parseStepTimer, remainingSeconds } from '../logic/cook';
import { dayLabel, isISODate, shortDate, shortWeekday, todayISO, weekdayIndex } from '../logic/dates';
import { dietSuitable, isKeto, recipeAllowed, recipeToEngine, toEngineCuisine, toEngineProtein } from '../logic/engineCatalog';
import { buildGroceryList, formatQty, groceryCount, groceryText } from '../logic/grocery';
import { historyFrom, dayFromRows, targetsFor } from '../logic/plan';
import { budgetTier, lifestyleOf, toMealProfile } from '../logic/profile';
import { cuisineLabel, dietTagLabel, formatGrams, formatServings, macrosFor, scaledIngredients, totalMinutes } from '../logic/recipe';
import { nextSlotIndex, slotLabel, slotTime } from '../logic/slots';
import { energyShare } from '../logic/targets';

const cat = getCatalog();
const karahi = cat.recipeById.get('chicken-karahi') as Recipe;

describe('allergens', () => {
  it('normalises every spelling to EU-14 names (stricter, never looser)', () => {
    expect(normaliseAllergies(['Dairy', 'egg', 'soy', 'shellfish', 'Peanut', 'tree nuts', 'bogus'])).toEqual([
      'milk', 'eggs', 'soybeans', 'crustaceans', 'molluscs', 'peanuts', 'nuts',
    ]);
    expect(normaliseAllergies(null)).toEqual([]);
    expect(normaliseAllergies(['sulfites', 'celery', 'mustard', 'lupin'])).toEqual(['sulphites', 'celery', 'mustard', 'lupin']);
  });
  it('finds hits and labels them', () => {
    expect(allergenHits(karahi, ['milk', 'gluten'])).toEqual(['milk']);
    expect(allergenHits(karahi, ['fish'])).toEqual([]);
    expect(allergenLabel('soybeans')).toBe('Soy');
    expect(allergenLabel('milk')).toBe('Milk');
  });
});

describe('engine catalogue adapter', () => {
  it('maps a content recipe to the engine shape (per-serving grams, total time, halal)', () => {
    const e = recipeToEngine(karahi, cat.foodById);
    expect(e.name).toBe('Chicken karahi');
    expect(e.prepMin).toBe(karahi.prepMin + karahi.cookMin);
    expect(e.allergens).toEqual(['dairy']);
    expect(e.dietTags).toContain('halal');
    expect(e.proteinSource).toBe('chicken');
    expect(e.ingredients[0]!.grams).toBeCloseTo(karahi.ingredients[0]!.grams / karahi.servings);
    expect(e.ingredients[0]!.aisle).toBe('poultry');
  });
  it('maps vocabularies the engine may not know yet', () => {
    expect(toEngineCuisine('pakistani')).toBe('pakistani');
    expect(['middle_eastern', 'arab']).toContain(toEngineCuisine('middle_eastern'));
    expect(['global', 'other']).toContain(toEngineCuisine('global'));
    expect(toEngineProtein('eggs')).toBe('egg');
    expect(toEngineProtein('other')).toBe('none');
    expect(toEngineProtein('chicken')).toBe('chicken');
  });
  it('checks diets and keto', () => {
    const veg = { dietTags: ['vegetarian'], perServing: karahi.perServing } as unknown as Recipe;
    const vegan = { dietTags: ['vegan'], perServing: karahi.perServing } as unknown as Recipe;
    expect(dietSuitable(veg, 'vegetarian')).toBe(true);
    expect(dietSuitable(veg, 'vegan')).toBe(false);
    expect(dietSuitable(vegan, 'vegetarian')).toBe(true);
    expect(dietSuitable(vegan, 'pescatarian')).toBe(true);
    expect(dietSuitable(karahi, 'halal')).toBe(true);
    expect(dietSuitable(karahi, 'vegetarian')).toBe(false);
    expect(dietSuitable(karahi, 'omnivore')).toBe(true);
    expect(isKeto(karahi)).toBe(false);
    const keto = { dietTags: ['low_carb'], perServing: { kcal: 500, protein: 25, carbs: 8, fat: 42, fibre: 3 } } as unknown as Recipe;
    expect(isKeto(keto)).toBe(true);
    expect(dietSuitable(keto, 'keto')).toBe(true);
  });
  it('recipeAllowed applies allergens, diet and never-show', () => {
    expect(recipeAllowed(karahi, { allergies: [], dietType: 'omnivore' })).toBe(true);
    expect(recipeAllowed(karahi, { allergies: ['milk'], dietType: 'omnivore' })).toBe(false);
    expect(recipeAllowed(karahi, { allergies: [], dietType: 'vegan' })).toBe(false);
    expect(recipeAllowed(karahi, { allergies: [], dietType: 'omnivore', neverShow: new Set([karahi.id]) })).toBe(false);
  });
});

describe('profile mapping', () => {
  const p = { sex: 'female', birthYear: 1990, heightCm: 165, weightKg: 60 };
  it('needs the body fields', () => {
    expect(toMealProfile(null)).toBeNull();
    expect(toMealProfile({ ...p, heightCm: null })).toBeNull();
    expect(toMealProfile({ ...p, sex: 'other' })).toBeNull();
  });
  it('fills safe defaults and clamps', () => {
    const m = toMealProfile({ ...p, days: 9, sessionMin: 5, cookMin: 1, mealsPerDay: 1, weightKg: 400 })!;
    expect(m.engine).toMatchObject({ goal: 'maintain', experience: 'beginner', daysPerWeek: 6, sessionMin: 20, cookMin: 5, mealsPerDay: 2, weightKg: 300, budget: 2, lifestyle: 'light', dietType: 'omnivore', units: 'metric' });
  });
  it('maps allergies, cuisines, budget and activity', () => {
    const m = toMealProfile({ ...p, allergies: ['milk', 'celery'], cuisines: ['pakistani', 'pakistani'], budget: 'low', activityLevel: 'very_active', dietType: 'halal', units: 'imperial', mealTimes: ['08:00'] })!;
    expect(m.allergies).toEqual(['milk', 'celery']);
    expect(m.engine.allergies).toContain('dairy');
    expect(m.engine.cuisines).toEqual(['pakistani']);
    expect(m.engine.budget).toBe(1);
    expect(m.engine.lifestyle).toBe('active');
    expect(m.dietType).toBe('halal');
    expect(m.units).toBe('imperial');
    expect(m.mealTimes).toEqual(['08:00']);
    expect(budgetTier('3')).toBe(3);
    expect(budgetTier('premium')).toBe(3);
    expect(budgetTier(null)).toBe(2);
    expect(lifestyleOf('moderate')).toBe('moderate');
    expect(lifestyleOf('nonsense')).toBe('light');
  });
  it('targets come from the engine (training > rest carbs)', () => {
    const m = toMealProfile({ ...p, goal: 'fat_loss', days: 4 })!;
    const tg = targetsFor(m.engine, '2026-11-19');
    expect(tg.training.kcal).toBeGreaterThan(tg.rest.kcal);
    expect(tg.training.carbs).toBeGreaterThan(tg.rest.carbs);
    expect(tg.training.protein).toBe(tg.rest.protein);
  });
});

describe('plan helpers', () => {
  it('historyFrom keeps planner slots with a recipe', () => {
    const h = historyFrom(
      [
        { date: '2026-11-10', slot: 'lunch', recipeId: 'a' },
        { date: '2026-11-10', slot: 'water', recipeId: 'b' },
        { date: '2026-11-11', slot: 'dinner', recipeId: null },
      ],
      { neverShow: ['x'], moreLike: [] },
    );
    expect(h.meals).toEqual([{ date: '2026-11-10', slot: 'lunch', recipeId: 'a' }]);
    expect(h.signals).toEqual({ neverShow: ['x'], moreLike: [] });
  });
  it('dayFromRows rebuilds engine meals and skips unknown recipes', () => {
    const e = recipeToEngine(karahi, cat.foodById);
    const { day, rowIndex } = dayFromRows(
      '2026-11-19',
      'rest',
      { kcal: 2000, protein: 150, carbs: 200, fat: 60 },
      [
        { slot: 'lunch', recipeId: 'nope', portion: 1 },
        { slot: 'dinner', recipeId: e.id, portion: 1.5 },
      ],
      new Map([[e.id, e]]),
    );
    expect(rowIndex).toEqual([1]);
    expect(day.meals[0]).toMatchObject({ slot: 'dinner', recipeId: e.id, servings: 1.5, kcal: Math.round(e.perServing.kcal * 1.5) });
    expect(day.totals.kcal).toBe(day.meals[0]!.kcal);
  });
});

describe('dates', () => {
  it('formats local days', () => {
    expect(weekdayIndex('2026-11-16')).toBe(0);
    expect(weekdayIndex('2026-11-22')).toBe(6);
    expect(shortWeekday('2026-11-19')).toBe('Thu');
    expect(dayLabel('2026-11-19', '2026-11-19')).toBe('Today');
    expect(dayLabel('2026-11-20', '2026-11-19')).toBe('Tomorrow');
    expect(dayLabel('2026-11-18', '2026-11-19')).toBe('Yesterday');
    expect(dayLabel('2026-11-23', '2026-11-19')).toBe('Mon 23 Nov');
    expect(shortDate('2026-03-01')).toBe('1 Mar');
    expect(isISODate('2026-11-19')).toBe(true);
    expect(isISODate('19/11/2026')).toBe(false);
    expect(isISODate(undefined)).toBe(false);
    expect(isISODate(todayISO(Date.UTC(2026, 10, 19, 12)))).toBe(true);
  });
});

describe('slots', () => {
  it('labels and times', () => {
    expect(slotLabel('breakfast')).toBe('Breakfast');
    expect(slotLabel('brunch')).toBe('Brunch');
    expect(slotTime('lunch')).toBe('13:00');
    expect(slotTime('lunch', ['lunch=12:15'])).toBe('12:15');
    expect(slotTime('dinner', ['7:30', '12:30', '19:00'])).toBe('19:00');
    expect(slotTime('breakfast', ['7:30', '12:30', '19:00'])).toBe('07:30');
    expect(slotTime('lunch', ['lunch=bad'])).toBe('13:00');
  });
  it('finds the next meal to eat', () => {
    const meals = [
      { slot: 'breakfast', status: 'eaten' },
      { slot: 'lunch', status: 'planned' },
      { slot: 'dinner', status: 'planned' },
    ];
    expect(nextSlotIndex(meals, '10:00')).toBe(1);
    expect(nextSlotIndex(meals, '15:00')).toBe(2);
    expect(nextSlotIndex(meals, '23:30')).toBe(1);
    expect(nextSlotIndex([{ slot: 'lunch', status: 'eaten' }], '10:00')).toBe(-1);
  });
});

describe('grocery', () => {
  const recipeById = cat.recipeById;
  const foodById = cat.foodById as ReadonlyMap<string, Food>;
  it('merges quantities across meals, scales by portion and skips skipped meals', () => {
    const list = buildGroceryList(
      [
        { recipeId: karahi.id, portion: 1, status: 'planned' },
        { recipeId: karahi.id, portion: 0.5, status: 'eaten' },
        { recipeId: karahi.id, portion: 3, status: 'skipped' },
        { recipeId: 'missing', portion: 1, status: 'planned' },
        { recipeId: null, portion: 1, status: 'planned' },
      ],
      recipeById,
      foodById,
    );
    const thigh = list.flatMap((a) => a.items).find((i) => i.foodId === 'chicken-thigh')!;
    expect(thigh.grams).toBeCloseTo((400 / 2) * 1.5);
    expect(thigh.aisle).toBe('poultry');
    expect(groceryCount(list)).toBe(karahi.ingredients.length);
    // Aisles follow the store walk order: vegetables before poultry before grains.
    const order = list.map((a) => a.aisle);
    expect(order.indexOf('vegetables')).toBeLessThan(order.indexOf('poultry'));
    expect(order.indexOf('poultry')).toBeLessThan(order.indexOf('grains'));
  });
  it('rounds quantities up for shopping', () => {
    expect(formatQty(0.4)).toBe('a pinch');
    expect(formatQty(3.2)).toBe('4 g');
    expect(formatQty(301)).toBe('305 g');
    expect(formatQty(1210)).toBe('1.3 kg');
    expect(formatQty(100, 'imperial')).toBe('4 oz');
    expect(formatQty(1000, 'imperial')).toBe('2.3 lb');
  });
  it('shares unticked items as text', () => {
    const list = buildGroceryList([{ recipeId: karahi.id, portion: 1, status: 'planned' }], recipeById, foodById);
    const txt = groceryText(list, new Set(['chicken-thigh']), 'List');
    expect(txt.startsWith('List')).toBe(true);
    expect(txt).toContain('Vegetables');
    expect(txt).toContain('• Tomato');
    expect(txt).not.toContain('Chicken thigh');
    const all = new Set(list.flatMap((a) => a.items.map((i) => i.foodId)));
    expect(groceryText(list, all, 'List')).toContain('All done');
  });
});

describe('recipe', () => {
  it('scales ingredients and macros', () => {
    const one = scaledIngredients(karahi, 1, cat.foodById);
    const two = scaledIngredients(karahi, 2, cat.foodById);
    expect(one[0]!.grams).toBeCloseTo(200);
    expect(two[0]!.grams).toBeCloseTo(400);
    expect(one[0]!.name).toBeTruthy();
    const m = macrosFor(karahi, 1.5);
    expect(m.kcal).toBeCloseTo(karahi.perServing.kcal * 1.5, 0);
    expect(m.protein).toBeCloseTo(karahi.perServing.protein * 1.5, 0);
  });
  it('formats', () => {
    expect(formatGrams(2.3)).toBe('2.5 g');
    expect(formatGrams(123.4)).toBe('123 g');
    expect(formatServings(1)).toBe('1');
    expect(formatServings(0.75)).toBe('0.75');
    expect(totalMinutes(karahi)).toBe(45);
    expect(cuisineLabel('middle_eastern')).toBe('Middle Eastern');
    expect(cuisineLabel('pakistani')).toBe('Pakistani');
    expect(dietTagLabel('halal_friendly')).toBe('Halal-friendly');
    expect(dietTagLabel('x')).toBe('x');
  });
});

describe('cook mode timers', () => {
  it('parses durations from step text (upper bound of ranges)', () => {
    expect(parseStepTimer('Simmer for 10 minutes.')).toEqual({ seconds: 600, label: '10 min' });
    expect(parseStepTimer('Grill for 10–12 minutes, turning.')).toEqual({ seconds: 720, label: '12 min' });
    expect(parseStepTimer('Fry 5-6 min each side')).toEqual({ seconds: 360, label: '6 min' });
    expect(parseStepTimer('Roast 1 hour')).toEqual({ seconds: 3600, label: '1 h' });
    expect(parseStepTimer('Blend for 30 seconds')).toEqual({ seconds: 30, label: '30 s' });
    expect(parseStepTimer('Heat 200 ml water to 220°C')).toBeNull();
    expect(parseStepTimer('Serve warm.')).toBeNull();
  });
  it('finds a timer in a fair share of real recipe steps', () => {
    const steps = cat.recipes.flatMap((r) => r.steps);
    const timed = steps.filter((s) => parseStepTimer(s) !== null);
    expect(timed.length).toBeGreaterThan(steps.length * 0.15);
  });
  it('formats clocks', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(-4)).toBe('00:00');
    expect(formatClock(599.2)).toBe('10:00');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatDuration(5400)).toBe('1 h 30 min');
    expect(remainingSeconds(10_500, 10_000)).toBe(1);
    expect(remainingSeconds(10_000, 12_000)).toBe(0);
  });
});

describe('targets', () => {
  it('energy share per macro', () => {
    expect(energyShare({ kcal: 2000, protein: 150, carbs: 200, fat: 67 })).toEqual({ protein: 30, carbs: 40, fat: 30 });
    expect(energyShare({ kcal: 0, protein: 10, carbs: 10, fat: 10 })).toEqual({ protein: 0, carbs: 0, fat: 0 });
  });
});
