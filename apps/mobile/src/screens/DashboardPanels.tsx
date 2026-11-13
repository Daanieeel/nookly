import { ASSIGNMENT_STATUSES } from "@nookly/shared/colors";
import { previewLines } from "@nookly/frontend/lib/note-preview";
import { useEntityMenu } from "./entity-actions.tsx";
import type {
  AssignmentRecord,
  DeckRecord,
  JotSummary,
  TaskRecord,
  TaskStatus,
} from "@nookly/shared/data";
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
import { Grid } from "../ui/Grid.tsx";
import { PageTabs, firstFilled } from "../ui/PageTabs.tsx";
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
import { StatusIcon } from "./StatusIcon.tsx";

/// Rows a list panel shows before "Show more".
const LIST_LIMIT = 4;

type Spaces = { id: string; name: string; color: string }[];

/// A panel of the Dashboard: a heading with its icon, a row of tabs with how many each holds,
/// and the list of the tab chosen. Until a tab is picked it shows the first that holds
/// something, so a panel never opens on nothing while another tab has items.
function Panel<Id extends string>({
  icon,
  title,
  tabs,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tabs: { id: Id; label: string; count: number }[];
  children: (tab: Id) => React.ReactNode;
}) {
  const [chosen, setChosen] = useState<Id | null>(null);
  const tab = chosen ?? firstFilled(tabs);
  return (
    <View accessibilityLabel={title} className="gap-1">
      <View className="flex-row items-center gap-2">
        {icon}
        <Text accessibilityRole="header" className="text-base font-semibold">
          {title}
        </Text>
      </View>
      <PageTabs label={`${title} tabs`} tabs={tabs} value={tab} onChange={setChosen} />
      {children(tab)}
    </View>
  );
}

/// The rows of a list, four of them and "Show N more". Flat, like the desktop's: no box
/// around them, a hairline between rows.
function Rows({ count, children }: { count: number; children: React.ReactNode[] }) {
  const [all, setAll] = useState(false);
  return (
    <View>
      {count === 0 ? <Calm icon={IconMoodSmile} text="Nothing here. Enjoy the calm." /> : null}
      {all ? children : children.slice(0, LIST_LIMIT)}
      {count > LIST_LIMIT ? (
        <View className="items-start pt-1">
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

/// What an empty tab says: a quiet line, never a box.
function Calm({ icon: Icon, text }: { icon: typeof IconMoodSmile; text: string }) {
  const theme = useTheme();
  return (
    <View className="flex-row items-center gap-2 py-3">
      <Icon size={16} color={theme.colors.mutedForeground} />
      <Text tone="muted">{text}</Text>
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

/// An item of a panel: its icon in a gutter, the title, and under the title the key and
/// what else the desktop shows on the row's right.
function ListRow({
  entityKey,
  icon,
  title,
  label,
  meta,
  onPress,
  onLongPress,
}: {
  entityKey: string;
  /// What a screen reader says for the row.
  label: string;
  icon: React.ReactNode;
  title: React.ReactNode;
  meta: React.ReactNode;
  onPress: () => void;
  /// The item's menu, the desktop's right click.
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      className="min-h-14 flex-row items-center gap-3 border-b border-border/60 py-2 active:bg-accent/40"
    >
      {icon ? <View className="w-5 items-center">{icon}</View> : null}
      <View className="flex-1 gap-0.5">
        {title}
        <View className="flex-row items-center gap-3">
          <Text variant="small" tone="muted" className="tabular-nums">
            {entityKey}
          </Text>
          {meta}
        </View>
      </View>
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
  const entityMenu = useEntityMenu();
  const theme = useTheme();
  const router = useRouter();
  return (
    <Panel
      icon={<IconChecklist size={16} color={theme.colors.mutedForeground} />}
      title="Tasks"
      tabs={TASK_TABS.map((t) => ({
        ...t,
        count: tasksFor(t.id, tasks, statuses, today).length,
      }))}
    >
      {(tab) => {
        const items = tasksFor(tab, tasks, statuses, today);
        return (
          <Rows count={items.length}>
            {items.map((task) => {
              const due = task.dueDate ? dueText(task.dueDate.slice(0, 10), today) : null;
              return (
                <ListRow
                  key={task.entity.id}
                  label={task.entity.title || "Untitled"}
                  entityKey={task.entity.key}
                  icon={
                    <StatusIcon status={statuses.find((s) => s.id === task.statusId)} size={18} />
                  }
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
                  onLongPress={() => entityMenu(task.entity)}
                />
              );
            })}
          </Rows>
        );
      }}
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
  const entityMenu = useEntityMenu();
  const theme = useTheme();
  const router = useRouter();
  return (
    <Panel
      icon={<IconClipboardList size={16} color={theme.colors.mutedForeground} />}
      title="Assignments"
      tabs={ASSIGNMENT_TABS.map((t) => ({
        ...t,
        count: assignmentsFor(t.id, assignments, today).length,
      }))}
    >
      {(tab) => {
        const items = assignmentsFor(tab, assignments, today);
        return (
          <Rows count={items.length}>
            {items.map((a) => {
              const due = a.dueDate ? dueText(a.dueDate.slice(0, 10), today) : null;
              return (
                <ListRow
                  key={a.entity.id}
                  label={a.entity.title || "Untitled"}
                  entityKey={a.entity.key}
                  icon={
                    <StatusIcon
                      status={ASSIGNMENT_STATUSES.find((s) => s.id === a.status)}
                      size={18}
                    />
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
                  onLongPress={() => entityMenu(a.entity)}
                />
              );
            })}
          </Rows>
        );
      }}
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
    >
      {() => (
        <View className="gap-2 pt-2">
          {ready.length === 0 ? (
            <Calm icon={IconSparkles} text="Nothing to study. Every deck is caught up." />
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
        </View>
      )}
    </Panel>
  );
}

/// Jots waiting to be refined into notes: the key, the first line and the Space.
export function JotsPanel({ jots, spaces }: { jots: JotSummary[]; spaces: Spaces }) {
  const entityMenu = useEntityMenu();
  const theme = useTheme();
  const router = useRouter();
  return (
    <Panel
      icon={<IconFeather size={16} color={theme.colors.mutedForeground} />}
      title="Jots"
      tabs={[{ id: "refine", label: "To be refined", count: jots.length }]}
    >
      {() => (
        <Rows count={jots.length}>
          {jots.map((jot) => {
            const first = jot.entity.title.trim() || (previewLines(jot.preview)[0] ?? "");
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
                onLongPress={() => entityMenu(jot.entity)}
              />
            );
          })}
        </Rows>
      )}
    </Panel>
  );
}
