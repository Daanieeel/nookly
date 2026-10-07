import { useQuery } from "@tanstack/react-query";
import { parseISO } from "date-fns";
import { useMemo } from "react";
import { listSpaces } from "#/lib/api/spaces.ts";
import type { SessionOccurrence } from "#/lib/api/types.ts";
import { useWeekStartsOn } from "#/lib/week-start.ts";
import { qk } from "#/lib/query-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { timeToMinutes, visibleDays } from "./calendar/calendar-model";
import { TimeGrid } from "./calendar/TimeGrid";
import { useCrossSpaceColumns } from "./calendar/use-cross-space-columns";

/// Lead time shown above the Session when the cut-out opens.
const LEAD_MINUTES = 30;

/// A slice of the week the Session sits in, scrolled to it, with the Session itself
/// outlined. It shows what else is going on around it (every Space's Sessions and
/// Calendar entries, plus the external overlay) and edits in place like the calendar.
export function SessionCalendarCutout({ occurrence }: { occurrence: SessionOccurrence }) {
  const setView = useNavStore((s) => s.setView);
  const weekStartsOn = useWeekStartsOn();
  const days = useMemo(
    () => visibleDays("week", parseISO(occurrence.date), weekStartsOn),
    [occurrence.date, weekStartsOn],
  );

  const { data: spaces = [] } = useQuery({ queryKey: qk.spaces, queryFn: listSpaces });
  const columns = useCrossSpaceColumns(days);
  const highlightIds = useMemo(() => new Set([occurrence.entity.id]), [occurrence.entity.id]);
  const spaceColor = (spaceId: string) => spaces.find((s) => s.id === spaceId)?.color;

  return (
    <section aria-label="Calendar" className="flex h-80 flex-col overflow-hidden rounded-lg border">
      <TimeGrid
        key={occurrence.entity.id}
        columns={columns}
        selection={null}
        highlightIds={highlightIds}
        onPickDay={() =>
          setView({ kind: "module", spaceId: occurrence.entity.spaceId, module: "sessions" })
        }
        spaceColor={spaceColor}
        initialScrollMinutes={Math.max(0, timeToMinutes(occurrence.startTime) - LEAD_MINUTES)}
      />
    </section>
  );
}
