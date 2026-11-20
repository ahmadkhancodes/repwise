/**
 * The bundled catalogues in engine shape (server, engine tests). Evaluates all three JSON files, so
 * the app never imports this module: it loads the JSON lazily through src/services/catalog.ts.
 */
import { exercises, foods, recipes } from './data';
import { toEngineCatalogues, type EngineCatalogues } from './toEngine';

let cached: EngineCatalogues | undefined;

/** Memoised engine conversion of the bundled JSON (one conversion per process / Worker isolate). */
export function engineCatalogues(): EngineCatalogues {
  cached ??= toEngineCatalogues({ exercises, recipes, foods });
  return cached;
}
