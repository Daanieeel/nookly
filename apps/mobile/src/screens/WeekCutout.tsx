import { daysOfView } from "@nookly/shared/time-grid";
import { useState } from "react";
import { View } from "react-native";
import { useAgenda, useExams, useSessions, useSpaces } from "../data/queries.ts";
import type { AgendaItem } from "@nookly/shared/data";
import { useWeekStart } from "../ui/entity-filters.tsx";
import { usePageWidth } from "../ui/pane.tsx";
import { useScale } from "../ui/scale.ts";
import { localDay } from "./dates.ts";
import { TimeGrid } from "./TimeGrid.tsx";

/// The cutout's height, the desktop's (`h-80`).
const HEIGHT = 320;

/// Minutes before what matters the cutout opens scrolled to, the desktop's.
const LEAD_MINUTES = 60;

const minutesOf = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

/// The desktop's week cutout (`CourseWeekCutout`) on a course's page: this week's hours with
/// every Space's sessions, entries and exams, the course's own drawn plainly and the rest
/// faded, so its week stands out against what else is going on.
export function CourseWeek({ courseId }: { courseId: string }) {
  const { data: sessions = [] } = useSessions({ courseId });
  const { data: exams = [] } = useExams({ courseId });
  const own = new Set([...sessions, ...exams].map((x) => x.entity.id));
  const now = new Date();
  return (
    <WeekCutout
      label="This week"
      day={localDay()}
      plain={(item) => own.has(item.id)}
      scrollTo={now.getHours() * 60 + now.getMinutes() - LEAD_MINUTES}
    />
  );
}

/// The desktop's `SessionCalendarCutout`: the session's week, the session itself plain.
export function SessionWeek({
  id,
  day,
  startTime,
}: {
  id: string;
  day: string;
  startTime: string;
}) {
  return (
    <WeekCutout
      label="Calendar"
      day={day}
      plain={(item) => item.id === id}
      scrollTo={minutesOf(startTime) - LEAD_MINUTES}
    />
  );
}

/// The week of `day` in the calendar's hours, what `plain` picks drawn plainly, the rest faded.
function WeekCutout({
  label,
  day,
  plain,
  scrollTo,
}: {
  label: string;
  day: string;
  plain: (item: AgendaItem) => boolean;
  /// The minute of the day it opens scrolled to.
  scrollTo: number;
}) {
  const weekStart = useWeekStart();
  const days = daysOfView("week", day, weekStart);
  const { data: items = [] } = useAgenda(days[0], days[days.length - 1]);
  const { data: spaces = [] } = useSpaces();
  // The page's column until the cutout has measured itself.
  const { gutter } = useScale();
  const [width, setWidth] = useState(Math.min(usePageWidth(), 768) - 2 * gutter);
  return (
    <View
      testID="week-cutout"
      accessibilityLabel={label}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      className="overflow-hidden rounded-lg border border-border"
      style={{ height: HEIGHT }}
    >
      <TimeGrid
        days={days}
        items={items}
        width={width}
        colorOf={(spaceId) => spaces.find((s) => s.id === spaceId)?.color}
        faded={(item) => !plain(item)}
        scrollTo={Math.max(0, scrollTo)}
      />
    </View>
  );
}
