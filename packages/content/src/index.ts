/**
 * @repwise/content — validated content catalogues for the planner, library and meals.
 * The JSON files are the source of truth; recipe nutrition is computed by scripts/build.ts.
 * `toEngine` adapts them to the `@repwise/engine` schemas.
 *
 * This barrel evaluates zod and all three JSON files. The app may only `import type` from it; its
 * value imports use the data-free subpaths `@repwise/content/toEngine`, `/media` and `/enums`.
 */
export * from './schemas';
export * from './compute';
export * from './data';
export * from './toEngine';
export * from './bundled';
export * from './media';
