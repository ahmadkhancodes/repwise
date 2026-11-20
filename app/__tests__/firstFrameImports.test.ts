/**
 * Perf audit r2 N1: nothing on the first-frame import chain may evaluate the content catalogues
 * (about 1 MB of JSON) or the content zod schemas. Metro in Expo 58 evaluates every static import
 * eagerly (no inline requires), so one value import of the `@repwise/content` barrel from the root
 * layout, the launch route or Today used to build all of it before the first frame.
 *
 * The catalogue data and schema modules are replaced with factories that record when they are
 * evaluated; the routes are then required in an isolated registry.
 */
const mockEvaluated: string[] = [];

jest.mock('../../packages/content/exercises.json', () => {
  mockEvaluated.push('exercises.json');
  return [];
});
jest.mock('../../packages/content/recipes.json', () => {
  mockEvaluated.push('recipes.json');
  return [];
});
jest.mock('../../packages/content/foods.json', () => {
  mockEvaluated.push('foods.json');
  return [];
});
jest.mock('../../packages/content/src/schemas', () => {
  mockEvaluated.push('content/schemas');
  return jest.requireActual('../../packages/content/src/schemas');
});
jest.mock('../../packages/content/src/data', () => {
  mockEvaluated.push('content/data');
  return { exercises: [], recipes: [], foods: [] };
});

jest.mock('@expo-google-fonts/inter', () => ({
  useFonts: () => [true, null],
  Inter_400Regular: 1,
  Inter_500Medium: 2,
  Inter_600SemiBold: 3,
  Inter_700Bold: 4,
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const FIRST_FRAME = [
  () => require('../_layout'),
  () => require('../index'),
  () => require('../(tabs)/_layout'),
  () => require('../(tabs)/today'),
];

beforeEach(() => {
  mockEvaluated.length = 0;
});

it('the root layout, launch route, tab bar and Today never evaluate the content catalogues or zod schemas', () => {
  jest.isolateModules(() => {
    for (const load of FIRST_FRAME) load();
  });
  expect(mockEvaluated).toEqual([]);
});

it('control: the content barrel does evaluate them (the guard can see an import)', () => {
  jest.isolateModules(() => {
    require('@repwise/content');
  });
  expect(mockEvaluated).toEqual(
    expect.arrayContaining(['content/schemas', 'content/data']),
  );
});

it('the lazy catalogue still loads the JSON on demand', () => {
  jest.isolateModules(() => {
    const { lazyCatalog } = require('@/services/catalog') as typeof import('@/services/catalog');
    expect(mockEvaluated).toEqual([]);
    lazyCatalog().exerciseById.get('x');
  });
  expect(mockEvaluated).toContain('exercises.json');
});
/* eslint-enable @typescript-eslint/no-require-imports */
