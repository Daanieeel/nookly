import { differenceInCalendarDays } from "date-fns";
import { formatShortDate } from "#/lib/datetime.ts";

export function SidebarUrgencyChip({ date }: { date: string }) {
  const target = new Date(date);
  const days = differenceInCalendarDays(target, new Date());
  const label = days <= 7 ? `${Math.max(days, 0)}d` : formatShortDate(target);
  return <span className="shrink-0 text-xs text-sidebar-foreground/60">{label}</span>;
}
