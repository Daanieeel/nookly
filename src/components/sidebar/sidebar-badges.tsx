import { differenceInCalendarDays, format } from "date-fns";

export function SidebarUrgencyChip({ date }: { date: string }) {
  const target = new Date(date);
  const days = differenceInCalendarDays(target, new Date());
  const label = days <= 7 ? `${Math.max(days, 0)}d` : format(target, "MMM d");
  return <span className="shrink-0 text-xs text-sidebar-foreground/60">{label}</span>;
}
