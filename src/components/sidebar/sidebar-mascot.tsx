import { useQuery } from "@tanstack/react-query";
import { getWeekYear, MascotFigure } from "@/components/mascot-figure";
import { Card } from "@/components/ui/card";
import { countTasksDueToday } from "@/lib/api/tasks";

export function SidebarMascot() {
  const { data } = useQuery({ queryKey: ["tasks-due-today"], queryFn: countTasksDueToday });
  const { week, year } = getWeekYear();
  const weekLine = `Week ${week} · ${year}`;
  const completionLine = data ? `${data.done}/${data.total} tasks done today` : "…";

  return (
    <Card className="flex-row items-center gap-2 p-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-1">
      {/* Fixed-size wrapper keeps the card's height locked to the text column
          even though the blob itself renders a bit larger and overflows it. */}
      <span className="relative size-7 shrink-0">
        <MascotFigure size={36} className="absolute -top-1 -left-1" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5 text-xs text-accent-foreground/70 group-data-[collapsible=icon]:hidden">
        <span className="truncate">{weekLine}</span>
        <span className="truncate">{completionLine}</span>
      </div>
    </Card>
  );
}
