/**
 * Sync engine (sheet 13): push dirty rows / pull by updated_at, last-write-wins,
 * soft deletes. Talks only to our Worker via src/services/api.ts. Not built yet —
 * owned by a later task; UI must never import the network directly.
 */
export {};
