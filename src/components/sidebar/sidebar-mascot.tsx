import { Blobatar } from "@blobatar/react";
import { useGaze } from "@blobatar/react/gaze";
import { useQuery } from "@tanstack/react-query";
import { getISOWeek, getISOWeekYear } from "date-fns";
import { Card } from "@/components/ui/card";
import { countTasksDueToday } from "@/lib/api/tasks";

export function SidebarMascot() {
  const { data } = useQuery({ queryKey: ["tasks-due-today"], queryFn: countTasksDueToday });
  const { ref } = useGaze({ travel: 3, lookAt: "pointer" });
  const now = new Date();
  const week = getISOWeek(now);
  const year = getISOWeekYear(now);
  const weekLine = `Week ${week} · ${year}`;
  const completionLine = data ? `${data.done}/${data.total} tasks done today` : "…";
  // Seeded with the ISO week/year (not a fixed constant) so the mascot is a new
  // blob every week, matching the week line above — same blob all week.
  const mascotName = `Week_${week}_${year}`;

  return (
    <Card className="flex-row items-center gap-2 p-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-1">
      {/* Fixed-size wrapper keeps the card's height locked to the text column
          even though the blob itself renders a bit larger and overflows it. */}
      <span className="relative size-7 shrink-0">
        <Blobatar
          ref={ref}
          name={mascotName}
          size={36}
          animate="always"
          className="absolute -top-1 -left-1"
        />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5 text-xs text-accent-foreground/70 group-data-[collapsible=icon]:hidden">
        <span className="truncate">{weekLine}</span>
        <span className="truncate">{completionLine}</span>
      </div>
    </Card>
  );
}
