/// Which entries of `values` form one longest strictly increasing run: given blocks'
/// places in a new order, the ones that can stay where they are.
export function longestIncreasing(values: number[]): Set<number> {
  // `ends[n]` is the index of the smallest value that ends a run of `n + 1`.
  const ends: number[] = [];
  const previous = values.map(() => -1);
  values.forEach((value, i) => {
    let length = ends.findIndex((end) => values[end] >= value);
    if (length < 0) length = ends.length;
    if (length > 0) previous[i] = ends[length - 1];
    ends[length] = i;
  });
  const kept = new Set<number>();
  for (let i = ends.at(-1) ?? -1; i >= 0; i = previous[i]) kept.add(values[i]);
  return kept;
}

/// The order an editor saves, when the stored order may have changed under it. `base` is
/// what the editor last saved, `mine` its blocks now and `stored` the rows now. Only what
/// the editor added or moved goes where it put it, behind the same block; everything else
/// keeps the stored order, and blocks removed on either side stay removed.
export function mergeOrder(base: string[], mine: string[], stored: string[]): string[] {
  const placeInBase = new Map(base.map((id, index) => [id, index]));
  const staying = longestIncreasing(mine.flatMap((id) => placeInBase.get(id) ?? []));
  const placedHere = new Set(
    mine.filter((id) => {
      const place = placeInBase.get(id);
      return place === undefined || !staying.has(place);
    }),
  );
  const kept = new Set(mine);
  const merged = stored.filter(
    (id) => !placedHere.has(id) && (kept.has(id) || !placeInBase.has(id)),
  );
  mine.forEach((id, index) => {
    if (!placedHere.has(id)) return;
    let at = 0;
    for (let before = index - 1; before >= 0; before--) {
      const found = merged.indexOf(mine[before]);
      if (found < 0) continue;
      at = found + 1;
      break;
    }
    merged.splice(at, 0, id);
  });
  return merged;
}
