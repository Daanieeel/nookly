const KEY_QUERY = /^([a-z]{3})(?:[\s-]*(\d+)|-)$/i;

/// Whether `query` is typed like an entity key (`TSK-14`, `tsk14`, `tsk 1`) and
/// `key` starts with it, so `TSK-1` also finds TSK-10. Needs a digit or a trailing
/// dash (`TSK-` lists every task), so a bare `not` stays a plain title search. Mirrors `search::parse_key_query` in Rust.
export function matchesKey(key: string, query: string): boolean {
  const match = KEY_QUERY.exec(query.trim());
  if (!match) return false;
  const [prefix, number] = key.split("-");
  return prefix === match[1]?.toUpperCase() && (number ?? "").startsWith(match[2] ?? "");
}

/// Whether `query` is shaped like a key at all, so a menu can tell an ID lookup from a
/// title search.
export function isKeyQuery(query: string): boolean {
  return KEY_QUERY.test(query.trim());
}

/// Orders key matches the way the backend search does: shortest number first, so
/// `FIL-23` comes before `FIL-233`.
export function compareKeys(a: { key: string }, b: { key: string }): number {
  const [, aNumber = ""] = a.key.split("-");
  const [, bNumber = ""] = b.key.split("-");
  return aNumber.length - bNumber.length || Number(aNumber) - Number(bNumber);
}

/// Title or key match for client side filters (list searches, pickers, mentions).
export function matchesTitleOrKey(
  entity: { title: string; key: string },
  query: string,
  title = entity.title,
): boolean {
  const needle = query.trim().toLowerCase();
  return !needle || title.toLowerCase().includes(needle) || matchesKey(entity.key, query);
}

/// cmdk `keywords` for an entity row, so `TSK-14` and `tsk14` both match it.
export function keyKeywords(key: string): string[] {
  return [key, key.replace("-", "")];
}
