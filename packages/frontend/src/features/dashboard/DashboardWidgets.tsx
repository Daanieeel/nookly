import { useLayoutEffect, useRef, useState } from "react";
import { AssignmentsPanel } from "./AssignmentsPanel";
import { CalendarPanel } from "./CalendarPanel";
import type { DashboardData } from "./dashboard-data";
import { LIST_LIMIT, nextRowLimit } from "./dashboard-model";
import { ListLimitProvider } from "./DashboardPanel";
import { DecksPanel } from "./DecksPanel";
import { JotsPanel } from "./JotsPanel";
import { TasksPanel } from "./TasksPanel";

/// How many rows each list shows so the left column fits in `available` pixels: all of
/// them while there is room, one fewer for every row the column is too tall by, down to one.
/// The column's height is read after every change, so the limit settles in a few frames
/// without bouncing: a row is only added back when the whole column would still fit.
function useFittingLimit(available: number | null, column: React.RefObject<HTMLElement | null>) {
  const [limit, setLimit] = useState(LIST_LIMIT);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const element = column.current;
    if (!element || !("ResizeObserver" in globalThis)) return;
    const measure = () => setHeight(element.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [column]);

  useLayoutEffect(() => {
    if (available == null || height === 0) return;
    setLimit(nextRowLimit(limit, height, available));
  }, [available, height, limit]);

  return limit;
}

/// Two columns:
///
///   Assignments | Calendar
///   Tasks       | Calendar
///   Decks       | Calendar
///   Jots        | Calendar
///
/// The lists show as many rows as fit in `available` pixels (the rest are behind "Show
/// more"), and the Calendar scrolls inside itself. When the window is too short for even one
/// row each, or for the Calendar's minimum height, the page scrolls as a last resort.
export function DashboardWidgets({
  data,
  available,
}: {
  data: DashboardData;
  /// Height left for the panels under the briefing, in pixels; null while unknown.
  available: number | null;
}) {
  const column = useRef<HTMLDivElement>(null);
  const limit = useFittingLimit(available, column);
  return (
    <div className="grid grid-cols-2 gap-x-10 lg:grid-cols-[3fr_2fr]">
      <ListLimitProvider value={limit}>
        <div ref={column} className="flex min-w-0 flex-col gap-4 self-start">
          <AssignmentsPanel today={data.today} />
          <TasksPanel today={data.today} />
          <DecksPanel />
          <JotsPanel data={data} />
        </div>
      </ListLimitProvider>
      <CalendarPanel now={data.now} />
    </div>
  );
}
