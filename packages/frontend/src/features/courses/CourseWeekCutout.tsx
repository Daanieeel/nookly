import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { listSpaces } from "#/lib/api/spaces.ts";
import { qk } from "#/lib/query-keys.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { useWeekStartsOn } from "#/lib/week-start.ts";
import { visibleDays } from "../sessions/calendar/calendar-model";
import { TimeGrid } from "../sessions/calendar/TimeGrid";
import { useCrossSpaceColumns } from "../sessions/calendar/use-cross-space-columns";

/// Minutes before now the cut-out opens scrolled to.
const LEAD_MINUTES = 60;

/// This week of the calendar, with every Space's Sessions, Calendar entries and Exams. What
/// belongs to the Course (`courseIds`) is drawn plainly, the rest faded, so the Course's own
/// week stands out against what else is going on.
export function CourseWeekCutout({ courseIds }: { courseIds: Set<string> }) {
  const setView = useNavStore((s) => s.setView);
  const weekStartsOn = useWeekStartsOn();
  const days = useMemo(() => visibleDays("week", new Date(), weekStartsOn), [weekStartsOn]);
  const columns = useCrossSpaceColumns(days);
  const { data: spaces = [] } = useQuery({ queryKey: qk.spaces, queryFn: listSpaces });
  const highlightIds = useMemo(() => new Set<string>(), []);
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  return (
    <section
      aria-label="This week"
      className="flex h-80 flex-col overflow-hidden rounded-lg border"
    >
      <TimeGrid
        columns={columns}
        selection={null}
        highlightIds={highlightIds}
        emphasisIds={courseIds}
        onPickDay={() => setView({ kind: "calendar" })}
        spaceColor={(spaceId) => spaces.find((s) => s.id === spaceId)?.color}
        initialScrollMinutes={Math.max(0, nowMinutes - LEAD_MINUTES)}
      />
    </section>
  );
}
