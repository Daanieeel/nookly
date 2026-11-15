import { View } from "react-native";
import { useSyncState } from "../data/context.tsx";
import {
  useAgenda,
  useAssignments,
  useCourses,
  useDecks,
  useExams,
  useSessions,
  useSpaces,
  useStatuses,
  useTasks,
  useUnrefinedJots,
} from "../data/queries.ts";
import { useSetting } from "../data/settings.ts";
import { Screen } from "../ui/Screen.tsx";
import { usePaneWidth } from "../ui/pane.tsx";
import { ASSIGNMENT_DONE } from "./AssignmentsScreen.tsx";
import { DashboardGreeting, useOpenTarget } from "./DashboardBriefing.tsx";
import { HomeScreen } from "./HomeScreen.tsx";
import { AssignmentsPanel, DecksPanel, JotsPanel, TasksPanel } from "./DashboardPanels.tsx";
import { buildBriefing } from "./briefing-runs.ts";
import { tasksFor } from "./dashboard-model.ts";
import { addDays, localDay } from "./dates.ts";
import { TimeGrid } from "./TimeGrid.tsx";
import { useSyncRefresh } from "./useSyncRefresh.ts";

const AHEAD_DAYS = 14;
/// From this pane width the dashboard has today's hours beside its lists.
const WIDE_DASHBOARD = 900;
const TODAY_WIDTH = 360;

/// What the Dashboard and the phone's Home show: today's items, what is due, the decks with
/// cards to learn, the jots to refine, and the sentence about the day.
export function useDashboard() {
  const today = localDay();
  const horizon = addDays(today, AHEAD_DAYS);
  const { data: items = [] } = useAgenda(today, today);
  const { data: tasks = [] } = useTasks(null);
  const { data: statuses = [] } = useStatuses();
  const { data: spaces = [] } = useSpaces();
  const { data: assignments = [] } = useAssignments({});
  const { data: exams = [] } = useExams({});
  const { data: courses = [] } = useCourses(null);
  const { data: decks = [] } = useDecks(null);
  const { data: sessions = [] } = useSessions({});
  const { data: jots = [] } = useUnrefinedJots(50);
  const [name] = useSetting("general.displayName");
  const syncState = useSyncState((s) => s.status.state);
  const { refreshing, onRefresh } = useSyncRefresh();
  const open = useOpenTarget(spaces[0]?.id);
  const colorOf = (spaceId: string) => spaces.find((s) => s.id === spaceId)?.color;
  const courseName = (id: string | null) => courses.find((c) => c.entity.id === id)?.entity.title;
  const examName = (id: string | null) => exams.find((e) => e.entity.id === id)?.entity.title;

  const dueTasks = tasksFor("today", tasks, statuses, today);
  const deadlines = [
    ...exams
      .filter(
        (e) =>
          e.status !== "done" &&
          e.examDate !== null &&
          e.examDate >= today &&
          e.examDate <= horizon,
      )
      .map((e) => ({
        kind: "exam" as const,
        id: e.entity.id,
        spaceId: e.entity.spaceId,
        title: e.entity.title,
        date: e.examDate ?? today,
      })),
    ...assignments
      .filter(
        (a) =>
          !ASSIGNMENT_DONE.has(a.status) &&
          a.dueDate !== null &&
          a.dueDate >= today &&
          a.dueDate <= horizon,
      )
      .map((a) => ({
        kind: "assignment" as const,
        id: a.entity.id,
        spaceId: a.entity.spaceId,
        title: a.entity.title,
        date: a.dueDate ?? today,
      })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const readyDecks = decks.filter((d) => d.stats.due + d.stats.learning + d.stats.new > 0);
  const briefing = buildBriefing({
    name,
    sessions: sessions
      .filter((s) => s.date === today && !s.cancelled)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map((s) => ({
        id: s.entity.id,
        spaceId: s.entity.spaceId,
        title: s.entity.title,
        courseId: s.courseId,
        courseTitle: s.courseTitle,
        date: s.date,
        startTime: s.startTime,
      })),
    tasks: dueTasks.map((t) => ({
      id: t.entity.id,
      title: t.entity.title,
      dueDate: t.dueDate ?? today,
    })),
    deadlines,
    decks: readyDecks.map((d) => ({
      id: d.entity.id,
      spaceId: d.entity.spaceId,
      title: d.entity.title,
      cards: d.stats.due + d.stats.learning + d.stats.new,
    })),
    jotCount: jots.length,
    oldestJotAt: jots[0]?.entity.createdAt ?? null,
    jotSpaceIds: [...new Set(jots.map((j) => j.entity.spaceId))],
  });
  const date = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return {
    today,
    items,
    tasks,
    statuses,
    spaces,
    assignments,
    decks,
    jots,
    deadlines,
    readyDecks,
    dueTasks,
    briefing,
    date,
    offline: syncState === "offline",
    refreshing,
    onRefresh,
    open,
    colorOf,
    courseName,
    examName,
  };
}

export type Dashboard = ReturnType<typeof useDashboard>;

/// The day at a glance. On an iPad the desktop's Dashboard: a sentence about the day whose
/// counts and names open the matching list, panels for assignments, tasks, decks and jots,
/// and today's hours beside them. On a phone a Home of shortcuts (`HomeScreen`).
export function DashboardScreen() {
  const d = useDashboard();
  const wide = usePaneWidth() >= WIDE_DASHBOARD;
  return wide ? <DesktopDashboard d={d} /> : <HomeScreen d={d} />;
}

function DesktopDashboard({ d }: { d: Dashboard }) {
  const { today, items, tasks, statuses, spaces, assignments, decks, jots } = d;
  const page = (
    <Screen onRefresh={d.onRefresh} refreshing={d.refreshing} wide>
      <DashboardGreeting date={d.date} offline={d.offline} briefing={d.briefing} open={d.open} />
      <AssignmentsPanel
        assignments={assignments}
        spaces={spaces}
        courseName={d.courseName}
        today={today}
      />
      <TasksPanel tasks={tasks} statuses={statuses} spaces={spaces} today={today} />
      <DecksPanel decks={decks} examName={d.examName} />
      <JotsPanel jots={jots} spaces={spaces} />
    </Screen>
  );
  // The desktop's Dashboard on an iPad: the lists on the left, today's hours on the right.
  return (
    <View className="flex-1 flex-row">
      <View className="flex-1">{page}</View>
      <View className="border-l border-border" style={{ width: TODAY_WIDTH }}>
        <TimeGrid days={[today]} items={items} width={TODAY_WIDTH} colorOf={d.colorOf} />
      </View>
    </View>
  );
}
