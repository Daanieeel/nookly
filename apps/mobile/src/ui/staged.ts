import { useEffect, useState } from "react";

/// How many rows a long list builds at once (about a screenful and a half), and how many
/// it adds each frame after.
export const STAGE = { first: 24, step: 40 } as const;

/// A long list's rows built in stages: the first screenful with the page, so a page change
/// never waits for rows far below the fold, the rest over the following frames.
export function useStaged<T>(items: readonly T[]): readonly T[] {
  const [count, setCount] = useState<number>(STAGE.first);
  const whole = count >= items.length;
  useEffect(() => {
    if (whole) return;
    // A frame later, so the page shows before the rest are built.
    const later = setTimeout(() => setCount((n) => n + STAGE.step), 16);
    return () => clearTimeout(later);
  }, [whole, count]);
  return whole ? items : items.slice(0, count);
}
