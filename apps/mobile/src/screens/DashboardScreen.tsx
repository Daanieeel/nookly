import { IconPlus } from "@tabler/icons-react-native";
import { Stack } from "expo-router";
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
import { IconButton } from "../ui/Button.tsx";
import { Section, Empty } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { usePaneWidth } from "../ui/pane.tsx";
import { useTheme } from "../ui/theme.ts";
import { AgendaRow } from "./CalendarScreen.tsx";
import { ASSIGNMENT_DONE } from "./AssignmentsScreen.tsx";
import { DashboardBriefing, useOpenTarget } from "./DashboardBriefing.tsx";
import { AssignmentsPanel, DecksPanel, JotsPanel, TasksPanel } from "./DashboardPanels.tsx";
import { buildBriefing } from "./briefing-runs.ts";
import { tasksFor } from "./dashboard-model.ts";
import { addDays, localDay } from "./dates.ts";
import { TimeGrid } from "./TimeGrid.tsx";
import { useSyncRefresh } from "./useSyncRefresh.ts";
import { useRouter } from "expo-router";

const AHEAD_DAYS = 14;
/// From this pane width the dashboard has today's hours beside its lists.
const WIDE_DASHBOARD = 900;
const TODAY_WIDTH = 360;

/// The day at a glance, like the desktop's Dashboard: a sentence about the day whose counts
/// and names open the matching list, then panels for assignments, tasks, decks and jots, and
/// today's hours (beside the panels on an iPad, under them on a phone).
export function DashboardScreen() {
  const theme = useTheme();
  const router = useRouter();
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

  const wide = usePaneWidth() >= WIDE_DASHBOARD;
  const page = (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton
              label="New Task"
              icon={<IconPlus size={22} color={theme.colors.foreground} />}
              onPress={() => router.push("/new/task")}
            />
          ),
        }}
      />
      <Screen onRefresh={onRefresh} refreshing={refreshing} wide={wide}>
        <View className="gap-2">
          <Text variant="small" tone="muted">
            {date}
            {syncState === "offline" ? ". Offline, changes sync later." : ""}
          </Text>
          <DashboardBriefing briefing={briefing} open={open} />
        </View>
        <AssignmentsPanel
          assignments={assignments}
          spaces={spaces}
          courseName={courseName}
          today={today}
        />
        <TasksPanel tasks={tasks} statuses={statuses} spaces={spaces} today={today} />
        <DecksPanel decks={decks} examName={examName} />
        <JotsPanel jots={jots} spaces={spaces} />
        {wide ? null : (
          <Section title="Today">
            {items.length === 0 ? (
              <Empty text="Nothing on the calendar today." />
            ) : (
              items.map((item) => (
                <View key={item.id}>
                  <AgendaRow item={item} color={colorOf(item.spaceId)} />
                </View>
              ))
            )}
          </Section>
        )}
      </Screen>
    </>
  );
  if (!wide) return page;
  // The desktop's Dashboard on an iPad: the lists on the left, today's hours on the right.
  return (
    <View className="flex-1 flex-row">
      <View className="flex-1">{page}</View>
      <View className="border-l border-border" style={{ width: TODAY_WIDTH }}>
        <TimeGrid days={[today]} items={items} width={TODAY_WIDTH} colorOf={colorOf} />
      </View>
    </View>
  );
}
