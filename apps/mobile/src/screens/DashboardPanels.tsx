import { ASSIGNMENT_STATUSES } from "@nookly/shared/colors";
import type {
  AssignmentRecord,
  DeckRecord,
  JotSummary,
  TaskRecord,
  TaskStatus,
} from "@nookly/shared/data";
import { CARD_CLASSES } from "@nookly/ui/classes";
import {
  IconCards,
  IconChecklist,
  IconClipboardList,
  IconFeather,
  IconMoodSmile,
  IconSparkles,
} from "@tabler/icons-react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { SpaceDot } from "../ui/Badge.tsx";
import { Button } from "../ui/Button.tsx";
import { cn } from "../ui/classes.ts";
import { Grid } from "../ui/Grid.tsx";
import { Presets } from "../ui/ListBar.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import {
  type AssignmentTab,
  type TaskTab,
  assignmentsFor,
  dueText,
  tasksFor,
} from "./dashboard-model.ts";
import { DeckTile } from "./StudyGalleries.tsx";
import { StatusIcon } from "./TaskRow.tsx";

/// Rows a list panel shows before "Show more".
const LIST_LIMIT = 4;

type Spaces = { id: string; name: string; color: string }[];

/// A panel of the Dashboard: a heading with its icon, a row of tabs with how many each holds,
/// and the list of the tab chosen.
function Panel<Id extends string>({
  icon,
  title,
  tabs,
  tab,
  onTab,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tabs: { id: Id; label: string; count: number }[];
  tab: Id;
  onTab: (id: Id) => void;
  children: React.ReactNode;
}) {
  return (
    <View accessibilityLabel={title} className="gap-2">
      <View className="flex-row items-center gap-2 px-1">
        {icon}
        <Text accessibilityRole="header" className="font-medium">
          {title}
        </Text>
      </View>
      <Presets
        label={`${title} tabs`}
        value={tab}
        onChange={onTab}
        options={tabs.map((t) => ({ id: t.id, label: t.label, count: t.count }))}
      />
      {children}
    </View>
  );
}

/// The rows of a list, four of them and "Show N more".
function Rows({ count, children }: { count: number; children: React.ReactNode[] }) {
  const [all, setAll] = useState(false);
  return (
    <View className={cn(CARD_CLASSES, "gap-0 overflow-hidden py-0")}>
      {count === 0 ? (
        <View className="flex-row items-center gap-2 p-4">
          <IconMoodSmile size={16} />
          <Text tone="muted">Nothing here. Enjoy the calm.</Text>
        </View>
      ) : null}
      {all ? children : children.slice(0, LIST_LIMIT)}
      {count > LIST_LIMIT ? (
        <View className="items-start px-2 py-1">
          <Button
            variant="ghost"
            size="sm"
            label={all ? "Show less" : `Show ${count - LIST_LIMIT} more`}
            onPress={() => setAll((a) => !a)}
          />
        </View>
      ) : null}
    </View>
  );
}

function SpaceChip({ spaces, id }: { spaces: Spaces; id: string }) {
  const space = spaces.find((s) => s.id === id);
  if (!space) return null;
  return (
    <View className="flex-row items-center gap-1">
      <SpaceDot color={space.color} />
      <Text variant="small" tone="muted" numberOfLines={1}>
        {space.name}
      </Text>
    </View>
  );
}

function ListRow({
  entityKey,
  icon,
  title,
  label,
  meta,
  onPress,
}: {
  entityKey: string;
  /// What a screen reader says for the row.
  label: string;
  icon: React.ReactNode;
  title: React.ReactNode;
  meta: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="min-h-11 gap-0.5 border-b border-border/60 px-3 py-2 active:bg-accent/40"
    >
      <View className="flex-row items-center gap-2">
        <Text variant="small" tone="muted">
          {entityKey}
        </Text>
        {icon}
        <View className="flex-1">{title}</View>
      </View>
      <View className="flex-row items-center gap-3 pl-1">{meta}</View>
    </Pressable>
  );
}

const TASK_TABS: { id: TaskTab; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "inProgress", label: "In progress" },
  { id: "upcoming", label: "Upcoming" },
  { id: "noDate", label: "No date" },
];

/// Open tasks that need attention, soonest due first.
export function TasksPanel({
  tasks,
  statuses,
  spaces,
  today,
}: {
  tasks: TaskRecord[];
  statuses: TaskStatus[];
  spaces: Spaces;
  today: string;
}) {
  const theme = useTheme();
  const router = useRouter();
  const [tab, setTab] = useState<TaskTab>("today");
  const items = tasksFor(tab, tasks, statuses, today);
  return (
    <Panel
      icon={<IconChecklist size={16} color={theme.colors.mutedForeground} />}
      title="Tasks"
      tabs={TASK_TABS.map((t) => ({ ...t, count: tasksFor(t.id, tasks, statuses, today).length }))}
      tab={tab}
      onTab={setTab}
    >
      <Rows count={items.length}>
        {items.map((task) => {
          const due = task.dueDate ? dueText(task.dueDate.slice(0, 10), today) : null;
          return (
            <ListRow
              key={task.entity.id}
              label={task.entity.title || "Untitled"}
              entityKey={task.entity.key}
              icon={<StatusIcon status={statuses.find((s) => s.id === task.statusId)} size={16} />}
              title={<Text numberOfLines={1}>{task.entity.title || "Untitled"}</Text>}
              meta={
                <>
                  <SpaceChip spaces={spaces} id={task.entity.spaceId} />
                  {due ? (
                    <Text variant="small" tone={due.overdue ? "destructive" : "muted"}>
                      {due.text}
                    </Text>
                  ) : null}
                </>
              }
              onPress={() => router.push(`/entity/${task.entity.id}`)}
            />
          );
        })}
      </Rows>
    </Panel>
  );
}

const ASSIGNMENT_TABS: { id: AssignmentTab; label: string }[] = [
  { id: "today", label: "For today" },
  { id: "dueToday", label: "Due today" },
  { id: "week", label: "Next 7 days" },
];

/// Assignments for a lecture today, due today and due in the next week.
export function AssignmentsPanel({
  assignments,
  spaces,
  courseName,
  today,
}: {
  assignments: AssignmentRecord[];
  spaces: Spaces;
  courseName: (id: string | null) => string | undefined;
  today: string;
}) {
  const theme = useTheme();
  const router = useRouter();
  const [tab, setTab] = useState<AssignmentTab>("dueToday");
  const items = assignmentsFor(tab, assignments, today);
  return (
    <Panel
      icon={<IconClipboardList size={16} color={theme.colors.mutedForeground} />}
      title="Assignments"
      tabs={ASSIGNMENT_TABS.map((t) => ({
        ...t,
        count: assignmentsFor(t.id, assignments, today).length,
      }))}
      tab={tab}
      onTab={setTab}
    >
      <Rows count={items.length}>
        {items.map((a) => {
          const due = a.dueDate ? dueText(a.dueDate.slice(0, 10), today) : null;
          return (
            <ListRow
              key={a.entity.id}
              label={a.entity.title || "Untitled"}
              entityKey={a.entity.key}
              icon={
                <StatusIcon status={ASSIGNMENT_STATUSES.find((s) => s.id === a.status)} size={16} />
              }
              title={<Text numberOfLines={1}>{a.entity.title || "Untitled"}</Text>}
              meta={
                <>
                  {courseName(a.courseId) ? (
                    <Text variant="small" tone="muted" numberOfLines={1}>
                      {courseName(a.courseId)}
                    </Text>
                  ) : null}
                  <SpaceChip spaces={spaces} id={a.entity.spaceId} />
                  {due ? (
                    <Text variant="small" tone={due.overdue ? "destructive" : "muted"}>
                      {due.text}
                    </Text>
                  ) : null}
                </>
              }
              onPress={() => router.push(`/entity/${a.entity.id}`)}
            />
          );
        })}
      </Rows>
    </Panel>
  );
}

/// Decks with cards to learn today: tiles with the stack, the figures and a play button.
export function DecksPanel({
  decks,
  examName,
}: {
  decks: DeckRecord[];
  examName: (id: string | null) => string | undefined;
}) {
  const theme = useTheme();
  const ready = decks.filter((d) => d.stats.due + d.stats.learning + d.stats.new > 0);
  const [all, setAll] = useState(false);
  const shown = all ? ready : ready.slice(0, LIST_LIMIT);
  return (
    <Panel
      icon={<IconCards size={16} color={theme.colors.mutedForeground} />}
      title="Decks"
      tabs={[{ id: "today", label: "Learn today", count: ready.length }]}
      tab="today"
      onTab={() => {}}
    >
      {ready.length === 0 ? (
        <View className={cn(CARD_CLASSES, "flex-row items-center gap-2 p-4")}>
          <IconSparkles size={16} />
          <Text tone="muted">Nothing to study. Every deck is caught up.</Text>
        </View>
      ) : (
        <Grid min={280} max={2}>
          {shown.map((deck) => (
            <DeckTile key={deck.entity.id} deck={deck} examName={examName(deck.examId)} />
          ))}
        </Grid>
      )}
      {ready.length > LIST_LIMIT ? (
        <View className="items-start">
          <Button
            variant="ghost"
            size="sm"
            label={all ? "Show less" : `Show ${ready.length - LIST_LIMIT} more`}
            onPress={() => setAll((a) => !a)}
          />
        </View>
      ) : null}
    </Panel>
  );
}

/// Jots waiting to be refined into notes: the key, the first line and the Space.
export function JotsPanel({ jots, spaces }: { jots: JotSummary[]; spaces: Spaces }) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <Panel
      icon={<IconFeather size={16} color={theme.colors.mutedForeground} />}
      title="Jots"
      tabs={[{ id: "refine", label: "To be refined", count: jots.length }]}
      tab="refine"
      onTab={() => {}}
    >
      <Rows count={jots.length}>
        {jots.map((jot) => {
          const first = (jot.entity.title || jot.preview).split("\n")[0].trim();
          return (
            <ListRow
              key={jot.entity.id}
              label={first || "Empty Jot"}
              entityKey={jot.entity.key}
              icon={null}
              title={
                first ? (
                  <Text numberOfLines={1}>{first}</Text>
                ) : (
                  <Text numberOfLines={1} tone="muted" className="italic">
                    Empty Jot
                  </Text>
                )
              }
              meta={<SpaceChip spaces={spaces} id={jot.entity.spaceId} />}
              onPress={() => router.push(`/entity/${jot.entity.id}`)}
            />
          );
        })}
      </Rows>
    </Panel>
  );
}
