import { daysOfView } from "@nookly/shared/time-grid";
import { useState } from "react";
import { View } from "react-native";
import { useAgenda, useExams, useSessions, useSpaces } from "../data/queries.ts";
import { useWeekStart } from "../ui/entity-filters.tsx";
import { usePageWidth } from "../ui/pane.tsx";
import { useScale } from "../ui/scale.ts";
import { localDay } from "./dates.ts";
import { TimeGrid } from "./TimeGrid.tsx";

/// The cutout's height, the desktop's (`h-80`).
const HEIGHT = 320;

/// The desktop's week cutout (`CourseWeekCutout`) on a course's page: this week's hours with
/// every Space's sessions, entries and exams, the course's own drawn plainly and the rest
/// faded, so its week stands out against what else is going on.
export function CourseWeek({ courseId }: { courseId: string }) {
  const weekStart = useWeekStart();
  const days = daysOfView("week", localDay(), weekStart);
  const { data: items = [] } = useAgenda(days[0], days[days.length - 1]);
  const { data: sessions = [] } = useSessions({ courseId });
  const { data: exams = [] } = useExams({ courseId });
  const { data: spaces = [] } = useSpaces();
  const own = new Set([...sessions, ...exams].map((x) => x.entity.id));
  // The page's column until the cutout has measured itself.
  const { gutter } = useScale();
  const [width, setWidth] = useState(Math.min(usePageWidth(), 768) - 2 * gutter);
  return (
    <View
      testID="course-week"
      accessibilityLabel="This week"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      className="overflow-hidden rounded-lg border border-border"
      style={{ height: HEIGHT }}
    >
      <TimeGrid
        days={days}
        items={items}
        width={width}
        colorOf={(spaceId) => spaces.find((s) => s.id === spaceId)?.color}
        faded={(item) => !own.has(item.id)}
      />
    </View>
  );
}
