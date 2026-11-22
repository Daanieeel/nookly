import { useEffect, useState } from "react";

/// How many rows a long list builds at once (about a screenful and a half), and how many
/// it adds each frame after.
export const STAGE = { first: 24, step: 40 } as const;

/// A long list's rows built in stages: the first screenful with the page, so a page change
/// never waits for rows far below the fold, the rest over the following frames.
export function useStaged<T>(items: readonly T[], layout = ""): readonly T[] {
  const [state, setState] = useState<{ count: number; layout: string }>({
    count: STAGE.first,
    layout,
  });
  // A new layout builds its rows from the first screenful again, not all at once.
  if (state.layout !== layout) setState({ count: STAGE.first, layout });
  const count = state.layout === layout ? state.count : STAGE.first;
  const whole = count >= items.length;
  useEffect(() => {
    if (whole) return;
    // A frame later, so the page shows before the rest are built.
    const later = setTimeout(
      () => setState((prev) => ({ ...prev, count: prev.count + STAGE.step })),
      16,
    );
    return () => clearTimeout(later);
  }, [whole, count]);
  return whole ? items : items.slice(0, count);
}
