import { refineJot } from "@nookly/shared/data";
import { IconPlus } from "@tabler/icons-react-native";
import { Stack, useRouter } from "expo-router";
import { View } from "react-native";
import { useLocalWrite, useSyncState } from "../data/context.tsx";
import {
  useAgenda,
  useAssignments,
  useDecks,
  useExams,
  usePinned,
  useSpaces,
  useStatuses,
  useTasks,
  useUnrefinedJots,
} from "../data/queries.ts";
import { useSetting } from "../data/settings.ts";
import { Button, IconButton } from "../ui/Button.tsx";
import { EntityIcon } from "../ui/icons.tsx";
import { Empty, Row, Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { usePaneWidth } from "../ui/pane.tsx";
import { useTheme } from "../ui/theme.ts";
import { AgendaRow } from "./CalendarScreen.tsx";
import { briefing } from "./briefing.ts";
import { addDays, dayLabel, localDay } from "./dates.ts";
import { deckSummary } from "./StudyLists.tsx";
import { TaskRow } from "./TaskRow.tsx";
import { TimeGrid } from "./TimeGrid.tsx";
import { useSyncRefresh } from "./useSyncRefresh.ts";

/// Assignments that no longer wait on the student: handed in, or graded.
export const ASSIGNMENT_DONE = new Set(["submitted", "graded"]);
const AHEAD_DAYS = 14;
/// From this pane width the dashboard has today's hours beside its lists.
const WIDE_DASHBOARD = 900;
const TODAY_WIDTH = 360;

/// The day at a glance, like the desktop's Dashboard: a sentence about the day, what is on
/// today, what is due, assignments and decks, jots waiting to be refined, and what is
/// pinned, across every Space.
export function DashboardScreen() {
  const theme = useTheme();
  const router = useRouter();
  const today = localDay();
  const horizon = addDays(today, AHEAD_DAYS);
  const { data: items = [] } = useAgenda(today, today);
  const { data: tasks = [] } = useTasks(null);
  const { data: statuses = [] } = useStatuses();
  const { data: spaces = [] } = useSpaces();
  const { data: pinnedItems = [] } = usePinned();
  const { data: assignments = [] } = useAssignments({});
  const { data: exams = [] } = useExams({});
  const { data: decks = [] } = useDecks(null);
  const { data: jots = [] } = useUnrefinedJots(5);
  const [name] = useSetting("general.displayName");
  const syncState = useSyncState((s) => s.status.state);
  const { refreshing, onRefresh } = useSyncRefresh();
  const refine = useLocalWrite((db, jotId: string) => refineJot(db, jotId));
  const finished = new Set(statuses.filter((s) => s.doneness >= 100).map((s) => s.id));
  const due = tasks.filter(
    (t) =>
      !finished.has(t.statusId) &&
      t.dueDate !== null &&
      t.dueDate <= today &&
      t.entity.type === "task",
  );
  const openAssignments = assignments
    .filter((a) => !ASSIGNMENT_DONE.has(a.status) && a.dueDate !== null && a.dueDate <= horizon)
    .slice(0, 5);
  const upcomingExams = exams.filter(
    (e) =>
      e.status !== "done" && e.examDate !== null && e.examDate >= today && e.examDate <= horizon,
  );
  const studyDecks = decks.filter((d) => d.stats.due + d.stats.learning > 0);
  const cardsDue = studyDecks.reduce((sum, d) => sum + d.stats.due + d.stats.learning, 0);
  const colorOf = (spaceId: string) => spaces.find((s) => s.id === spaceId)?.color;
  const date = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const summary = briefing({
    name,
    sessionsToday: items.filter((i) => i.kind === "session").length,
    entriesToday: items.filter((i) => i.kind === "calendar_entry").length,
    tasksDue: due.filter((t) => t.dueDate === today).length,
    tasksOverdue: due.filter((t) => (t.dueDate ?? today) < today).length,
    deadlines: openAssignments.length + upcomingExams.length,
    cardsDue,
    jotsToRefine: jots.length,
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
      <Screen onRefresh={onRefresh} refreshing={refreshing}>
        <View className="gap-1">
          <Text variant="title" accessibilityRole="header">
            {summary.greeting}
          </Text>
          <Text tone="muted">
            {date}
            {syncState === "offline" ? ". Offline, changes sync later." : ""}
          </Text>
          <Text className="pt-2 text-base">{summary.text}</Text>
        </View>
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
        <Section title="Due">
          {due.length === 0 ? (
            <Empty text="No tasks due." />
          ) : (
            due.map((task) => (
              <View key={task.entity.id}>
                <TaskRow
                  task={task}
                  statuses={statuses}
                  spaceColor={colorOf(task.entity.spaceId)}
                />
              </View>
            ))
          )}
        </Section>
        {openAssignments.length > 0 || upcomingExams.length > 0 ? (
          <Section
            title="Assignments and exams"
            action={
              <Button
                label="All Assignments"
                variant="ghost"
                size="sm"
                onPress={() => router.push("/assignments")}
              />
            }
          >
            {upcomingExams.map((exam) => (
              <View key={exam.entity.id}>
                <Row
                  title={exam.entity.title || "Exam"}
                  subtitle={`Exam, ${dayLabel(exam.examDate ?? today, today)}`}
                  icon={<EntityIcon type="exam" icon={exam.entity.icon} />}
                  onPress={() => router.push(`/entity/${exam.entity.id}`)}
                />
              </View>
            ))}
            {openAssignments.map((a) => (
              <View key={a.entity.id}>
                <Row
                  title={a.entity.title || "Assignment"}
                  subtitle={`Due ${dayLabel(a.dueDate ?? today, today)}`}
                  icon={<EntityIcon type="assignment" icon={a.entity.icon} />}
                  onPress={() => router.push(`/entity/${a.entity.id}`)}
                />
              </View>
            ))}
          </Section>
        ) : null}
        {studyDecks.length > 0 ? (
          <Section title="Study">
            {studyDecks.map((deck) => (
              <View key={deck.entity.id}>
                <Row
                  title={deck.entity.title || "Deck"}
                  subtitle={deckSummary(deck.stats)}
                  icon={<EntityIcon type="index_card_deck" icon={deck.entity.icon} />}
                  onPress={() => router.push(`/study/${deck.entity.id}`)}
                />
              </View>
            ))}
          </Section>
        ) : null}
        {jots.length > 0 ? (
          <Section title="Jots to refine">
            {jots.map((jot) => (
              <View key={jot.entity.id}>
                <Row
                  title={jot.entity.title || "Untitled"}
                  subtitle={jot.preview || undefined}
                  icon={<EntityIcon type="jot" icon={jot.entity.icon} />}
                  trailing={
                    <Button
                      label="Refine"
                      variant="secondary"
                      size="sm"
                      onPress={() =>
                        refine.mutate(jot.entity.id, {
                          onSuccess: (note) => router.push(`/entity/${note}`),
                        })
                      }
                    />
                  }
                  onPress={() => router.push(`/entity/${jot.entity.id}`)}
                />
              </View>
            ))}
          </Section>
        ) : null}
        {pinnedItems.length > 0 ? (
          <Section title="Pinned">
            {pinnedItems.map((entity) => (
              <View key={entity.id}>
                <Row
                  title={entity.title || "Untitled"}
                  subtitle={entity.key}
                  icon={<EntityIcon type={entity.type} icon={entity.icon} />}
                  onPress={() => router.push(`/entity/${entity.id}`)}
                />
              </View>
            ))}
          </Section>
        ) : null}
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
