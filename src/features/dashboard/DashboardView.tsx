import { DashboardBriefing } from "@/features/dashboard/DashboardBriefing";
import { useDashboardData } from "@/features/dashboard/dashboard-data";
import { DashboardWidgets } from "@/features/dashboard/DashboardWidgets";

/// Single, global, non-duplicable Dashboard (§4.2), one of the few things
/// allowed to cross the Space hard wall.
///
/// The briefing sentence and the flat sections below it read one shared data
/// source, so the prose and the lists always describe the same facts.
export function DashboardView() {
  const data = useDashboardData();
  return (
    <div className="flex flex-col gap-6">
      <DashboardBriefing data={data} />
      <DashboardWidgets data={data} />
    </div>
  );
}
