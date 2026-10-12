import { IconCalendarWeek } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { startOfDay } from "date-fns";
import { useMemo } from "react";
import { TimeGrid } from "#/features/sessions/calendar/TimeGrid.tsx";
import { useCrossSpaceColumns } from "#/features/sessions/calendar/use-cross-space-columns.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import { qk } from "#/lib/query-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { Panel } from "./DashboardPanel";

/// Hours of lead shown above the current time when the panel opens.
const LEAD_MINUTES = 60;
const NO_HIGHLIGHT = new Set<string>();

/// Today's day view of the cross Space calendar: Sessions, Calendar entries and the
/// external overlay, edited in place like on the Calendar page.
export function CalendarPanel({ now, className }: { now: Date; className?: string }) {
  const setView = useNavStore((s) => s.setView);
  const { data: spaces = [] } = useQuery({ queryKey: qk.spaces, queryFn: listSpaces });
  const today = startOfDay(now).getTime();
  const days = useMemo(() => [new Date(today)], [today]);
  const columns = useCrossSpaceColumns(days);
  const spaceColor = (spaceId: string) => spaces.find((s) => s.id === spaceId)?.color;

  return (
    <Panel icon={IconCalendarWeek} title="Calendar" className={className}>
      {/* The grid fills the box without adding to the row's height, which the left column sets. */}
      <div className="relative min-h-96 flex-1">
        <div className="absolute inset-0 flex flex-col overflow-hidden rounded-lg border">
          <TimeGrid
            key={today}
            columns={columns}
            selection={null}
            highlightIds={NO_HIGHLIGHT}
            onPickDay={() => setView({ kind: "calendar" })}
            spaceColor={spaceColor}
            initialScrollMinutes={Math.max(
              0,
              now.getHours() * 60 + now.getMinutes() - LEAD_MINUTES,
            )}
          />
        </div>
      </div>
    </Panel>
  );
}
