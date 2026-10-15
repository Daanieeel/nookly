import { AssignmentsPanel } from "./AssignmentsPanel";
import { CalendarPanel } from "./CalendarPanel";
import type { DashboardData } from "./dashboard-data";
import { DecksPanel } from "./DecksPanel";
import { JotsPanel } from "./JotsPanel";
import { TasksPanel } from "./TasksPanel";

/// Two columns:
///
///   Assignments | Calendar
///   Tasks       | Calendar
///   Decks       | Calendar
///   Jots        | Calendar
///
/// The Calendar is as tall as the left column and scrolls inside itself. The page
/// scrolls when the window is shorter than the left column.
export function DashboardWidgets({ data }: { data: DashboardData }) {
  return (
    <div className="grid grid-cols-2 gap-x-10 @3xl:grid-cols-[3fr_2fr]">
      <div className="flex min-w-0 flex-col gap-4">
        <AssignmentsPanel today={data.today} />
        <TasksPanel today={data.today} />
        <DecksPanel />
        <JotsPanel data={data} />
      </div>
      <CalendarPanel now={data.now} />
    </div>
  );
}
