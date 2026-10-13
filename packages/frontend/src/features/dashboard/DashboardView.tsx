import { useLayoutEffect, useRef, useState } from "react";
import { DashboardBriefing } from "#/features/dashboard/DashboardBriefing.tsx";
import { useDashboardData } from "#/features/dashboard/dashboard-data.ts";
import { DashboardWidgets } from "#/features/dashboard/DashboardWidgets.tsx";

/// Space between the briefing and the panels, the `gap-3` below, in pixels.
const GAP = 12;

/// The height the panels can use: what the page offers, less its padding, the briefing and
/// the gap. Null until measured, and without a `ResizeObserver` to follow the window.
function useAvailableHeight(
  root: React.RefObject<HTMLElement | null>,
  briefing: React.RefObject<HTMLElement | null>,
): number | null {
  const [available, setAvailable] = useState<number | null>(null);
  useLayoutEffect(() => {
    const page = root.current?.parentElement;
    const top = briefing.current;
    if (!page || !top || !("ResizeObserver" in globalThis)) return;
    const measure = () => {
      const style = getComputedStyle(page);
      const padding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
      setAvailable(page.clientHeight - padding - top.offsetHeight - GAP);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(page);
    observer.observe(top);
    return () => observer.disconnect();
  }, [root, briefing]);
  return available;
}

/// Single, global, non-duplicable Dashboard (§4.2), one of the few things
/// allowed to cross the Space hard wall.
///
/// The briefing sentence and the panels below it read the same facts. In a full screen window
/// the page does not scroll: the sentence is capped at a few lines and the lists show only the
/// rows that fit. On a window too short for that, the page scrolls as a last resort.
export function DashboardView() {
  const data = useDashboardData();
  const root = useRef<HTMLDivElement>(null);
  const briefing = useRef<HTMLDivElement>(null);
  const available = useAvailableHeight(root, briefing);
  return (
    <div ref={root} className="flex flex-col gap-3">
      <DashboardBriefing ref={briefing} data={data} />
      <DashboardWidgets data={data} available={available} />
    </div>
  );
}
