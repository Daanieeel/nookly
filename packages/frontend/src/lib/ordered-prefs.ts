/// A list the user can reorder and hide entries of, read back from a stored copy: what is
/// still valid keeps its place, and an entry the stored copy lacks (one a later version
/// introduced) slots in after the entry that precedes it by default, not at the end.

/// `kept` holds the stored entries already checked, one per known id. `make` builds an
/// entry for an id the stored list did not have.
export function addMissingDefaults<Id extends string, T extends { id: Id }>(
  defaultIds: readonly Id[],
  kept: T[],
  make: (id: Id) => T,
): T[] {
  const result = [...kept];
  const has = new Set<string>(kept.map((k) => k.id));
  defaultIds.forEach((id, defaultIndex) => {
    if (has.has(id)) return;
    const before = defaultIds
      .slice(0, defaultIndex)
      .toReversed()
      .map((prev) => result.findIndex((k) => k.id === prev))
      .find((i) => i !== -1);
    result.splice(before === undefined ? 0 : before + 1, 0, make(id));
    has.add(id);
  });
  return result;
}
