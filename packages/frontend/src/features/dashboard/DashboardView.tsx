import { DashboardBriefing } from "#/features/dashboard/DashboardBriefing.tsx";
import { useDashboardData } from "#/features/dashboard/dashboard-data.ts";
import { DashboardWidgets } from "#/features/dashboard/DashboardWidgets.tsx";

/// Single, global, non-duplicable Dashboard (§4.2), one of the few things
/// allowed to cross the Space hard wall.
///
/// The briefing sentence and the panels below it read the same facts. The page
/// never scrolls: each panel is sized to fit.
export function DashboardView() {
  const data = useDashboardData();
  return (
    <div className="flex flex-col gap-3">
      <DashboardBriefing data={data} />
      <DashboardWidgets data={data} />
    </div>
  );
}
