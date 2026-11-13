/// Things the app makes once per run, kept on the global object so they outlive their
/// module: in development Metro runs a changed file again (a hot reload), and the app's root
/// would otherwise open the database a second time while the first connection still holds
/// statements ("database is locked"), and start a second sync and automation.
const kept = globalThis as { __nooklyOnce?: Map<string, unknown> };

export function runOnce<T>(key: string, make: () => T): T {
  kept.__nooklyOnce ??= new Map();
  if (!kept.__nooklyOnce.has(key)) kept.__nooklyOnce.set(key, make());
  // SAFETY: each key is only ever stored by `make` of the same call site, so of type T.
  return kept.__nooklyOnce.get(key) as T;
}
