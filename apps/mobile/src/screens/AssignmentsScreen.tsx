import { ListGroup, ListItem } from "../ui/ListMotion.tsx";
import { statusOption } from "./option-badges.tsx";
import { ASSIGNMENT_STATUSES } from "@nookly/shared/colors";
import { useEntityMenu } from "./entity-actions.tsx";
import { type AssignmentRecord, updateAssignment } from "@nookly/shared/data";
import { IconCircleDot, IconLayoutKanban, IconList, IconSchool } from "@tabler/icons-react-native";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { z } from "zod";
import { useLocalWrite } from "../data/context.tsx";
import { usePreference } from "../data/preferences.ts";
import { useAssignments, useCourses, useSpaces } from "../data/queries.ts";
import { Band } from "../ui/Band.tsx";
import { SpaceDot } from "../ui/Badge.tsx";
import { cn } from "../ui/classes.ts";
import { ListHeader } from "../ui/ListBar.tsx";
import { ROW_DIVIDER } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { DisplayGroup, FilterField, LayoutTiles, SelectRow } from "../ui/sheet/DisplayParts.tsx";
import { Sheet } from "../ui/sheet/Sheet.tsx";
import { Text } from "../ui/Text.tsx";
import {
  ASSIGNMENT_GROUPINGS,
  ASSIGNMENT_ORDERINGS,
  type AssignmentGroup,
  groupAssignments,
  isHandedIn,
} from "./assignment-view.ts";
import { dueText } from "./dashboard-model.ts";
import { localDay } from "./dates.ts";
import { DueLine, StatusButton } from "./TaskRow.tsx";
import { StatusIcon } from "./StatusIcon.tsx";
import { Board } from "../ui/Board.tsx";
import { barButton } from "../ui/bar.ts";
import { TOOLBAR_ICONS } from "../ui/toolbar-icons.ts";

/// Assignments that no longer wait on the student: handed in, or graded.
export const ASSIGNMENT_DONE = new Set(["submitted", "evaluated"]);

const displaySchema = z.object({
  layout: z.enum(["list", "board"]),
  grouping: z.enum(["due", "course", "status", "space"]),
  /// Older saved displays have none: they keep the rest and order automatically.
  ordering: z
    .enum(["auto", "due", "created", "updated", "title", "status", "grade"])
    .default("auto"),
  /// Course and status ids the list is narrowed to; empty means all.
  courses: z.array(z.string()),
  statuses: z.array(z.string()),
});
type Display = z.infer<typeof displaySchema>;
const DEFAULT: Display = {
  layout: "list",
  grouping: "due",
  ordering: "auto",
  courses: [],
  statuses: [],
};

interface RowProps {
  assignment: AssignmentRecord;
  courseName?: string;
  spaceName?: string;
  spaceColor?: string;
  today: string;
}

/// An assignment's second line: its key, when it is due, its course and its Space.
function Meta({
  assignment,
  due,
  courseName,
  spaceName,
  spaceColor,
}: Omit<RowProps, "today"> & { due: { text: string; overdue: boolean } | null }) {
  return (
    <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
      <Text variant="small" tone="muted">
        {assignment.entity.key}
      </Text>
      {assignment.dueDate ? <DueLine day={assignment.dueDate} due={due} /> : null}
      {courseName ? (
        <Text variant="small" tone="muted" numberOfLines={1}>
          {courseName}
        </Text>
      ) : null}
      {spaceName ? (
        <View className="flex-row items-center gap-1">
          {spaceColor ? <SpaceDot color={spaceColor} /> : null}
          <Text variant="small" tone="muted">
            {spaceName}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/// An assignment in a list, or on a board's card (`card`): its status circle, which opens
/// the statuses, its title and the rest under it.
function Row({ card = false, ...props }: RowProps & { card?: boolean }) {
  const { assignment, today } = props;
  const entityMenu = useEntityMenu();
  const router = useRouter();
  const done = isHandedIn(assignment);
  const mark = useLocalWrite((db, next: string) =>
    updateAssignment(db, assignment.entity.id, { status: next }),
  );
  const due = assignment.dueDate && !done ? dueText(assignment.dueDate.slice(0, 10), today) : null;
  const circle = (
    <View className="size-6 items-center justify-center">
      <StatusButton
        title={assignment.entity.title || "assignment"}
        status={ASSIGNMENT_STATUSES.find((s) => s.id === assignment.status)}
        statuses={ASSIGNMENT_STATUSES}
        onPick={(id) => mark.mutate(id)}
      />
    </View>
  );
  if (card) {
    return (
      <>
        <View className={cn("flex-row items-start gap-3", done && "opacity-60")}>
          {circle}
          <Text numberOfLines={3} className="flex-1">
            {assignment.entity.title || "Untitled"}
          </Text>
        </View>
        <Meta {...props} due={due} />
      </>
    );
  }
  return (
    <View
      className={cn("flex-row items-center gap-3 px-1 py-2", ROW_DIVIDER, done && "opacity-60")}
    >
      {circle}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${assignment.entity.title || "Untitled"}, ${assignment.entity.key}`}
        onPress={() => router.push(`/entity/${assignment.entity.id}`)}
        onLongPress={() => entityMenu(assignment.entity)}
        className="min-h-11 flex-1 justify-center gap-1 active:opacity-70"
      >
        <Text numberOfLines={1}>{assignment.entity.title || "Untitled"}</Text>
        <Meta {...props} due={due} />
      </Pressable>
    </View>
  );
}

/// Assignments of one Space or of every Space, grouped by deadline as the desktop's overview
/// does (overdue, today, this week, next week, later, no due date, and what is done), or by
/// course, status or Space, narrowed by course and status, or laid out as a board by status.
export function AssignmentsScreen({ spaceId = null }: { spaceId?: string | null }) {
  const router = useRouter();
  const today = localDay();
  const { data: all = [] } = useAssignments(spaceId ? { spaceId } : {});
  const { data: courses = [] } = useCourses(spaceId);
  const { data: spaces = [] } = useSpaces();
  const [display, setDisplay] = usePreference<Display>(
    `assignments.display.${spaceId ?? "all"}`,
    displaySchema,
    DEFAULT,
  );
  const [panel, setPanel] = useState<"filter" | "display" | null>(null);
  const courseName = (id: string | null) => courses.find((c) => c.entity.id === id)?.entity.title;
  const spaceOf = (id: string) => spaces.find((s) => s.id === id);
  const shown = all.filter(
    (a) =>
      (display.courses.length === 0 || display.courses.includes(a.courseId ?? "none")) &&
      (display.statuses.length === 0 || display.statuses.includes(a.status)),
  );
  const grouping = display.layout === "board" ? "status" : display.grouping;
  const groups: AssignmentGroup[] = groupAssignments(
    shown,
    grouping,
    {
      today,
      courseName,
      spaceName: (id) => spaceOf(id)?.name,
    },
    display.ordering,
  );
  const moveTo = useLocalWrite((db, move: { id: string; status: string }) =>
    updateAssignment(db, move.id, { status: move.status }),
  );
  const newOne = () =>
    router.push(spaceId ? `/new/assignment?spaceId=${spaceId}` : "/new/assignment");
  const row = (a: AssignmentRecord, card = false) => (
    <Row
      card={card}
      assignment={a}
      courseName={courseName(a.courseId)}
      spaceName={spaceId ? undefined : spaceOf(a.entity.spaceId)?.name}
      spaceColor={spaceOf(a.entity.spaceId)?.color}
      today={today}
    />
  );
  return (
    <>
      <Stack.Screen
        options={{
          title: "Assignments",
          unstable_headerRightItems: () => [
            barButton({ label: "New Assignment", icon: TOOLBAR_ICONS.plus, onPress: newOne }),
          ],
        }}
      />
      <Screen wide={display.layout === "board"}>
        <ListHeader title="Assignments" count={all.length} panel={panel} onPanel={setPanel} />
        <Sheet
          open={panel === "filter"}
          onOpenChange={(open) => !open && setPanel(null)}
          title="Filter"
        >
          <DisplayGroup>
            <FilterField
              label="Course"
              icon={IconSchool}
              values={display.courses}
              options={courses.map((c) => ({
                id: c.entity.id,
                label: c.entity.title || "Untitled",
              }))}
              onChange={(next) => setDisplay({ ...display, courses: next })}
            />
            <FilterField
              label="Status"
              icon={IconCircleDot}
              values={display.statuses}
              options={ASSIGNMENT_STATUSES.map(statusOption)}
              onChange={(next) => setDisplay({ ...display, statuses: next })}
            />
          </DisplayGroup>
        </Sheet>
        <Sheet
          open={panel === "display"}
          onOpenChange={(open) => !open && setPanel(null)}
          title="Display"
        >
          <View className="gap-3">
            <LayoutTiles
              tiles={[
                { id: "list", label: "List", icon: IconList },
                { id: "board", label: "Board", icon: IconLayoutKanban },
              ]}
              value={display.layout}
              onSelect={(layout) => setDisplay({ ...display, layout })}
            />
            <DisplayGroup>
              {display.layout === "list" ? (
                <SelectRow
                  label="Grouping"
                  value={display.grouping}
                  options={[...ASSIGNMENT_GROUPINGS]}
                  onChange={(grouping) => setDisplay({ ...display, grouping })}
                />
              ) : null}
              <SelectRow
                label="Ordering"
                value={display.ordering}
                options={[...ASSIGNMENT_ORDERINGS]}
                onChange={(ordering) => setDisplay({ ...display, ordering })}
              />
            </DisplayGroup>
          </View>
        </Sheet>
        {all.length === 0 ? (
          <Text tone="muted">No assignments yet. Add them to a course.</Text>
        ) : null}
        {all.length > 0 && groups.length === 0 ? (
          <Text tone="muted">Nothing matches these filters.</Text>
        ) : null}
        {display.layout === "board" ? (
          <Board
            // Every status a card can go to, empty ones too, as the desktop's board.
            columns={ASSIGNMENT_STATUSES.filter(
              (s) => display.statuses.length === 0 || display.statuses.includes(s.id),
            ).map((s) => ({
              id: s.id,
              title: s.name,
              icon: <StatusIcon status={s} size={16} />,
              items: groups.find((g) => g.id === s.id)?.items ?? [],
            }))}
            keyOf={(a) => a.entity.id}
            labelOf={(a) => a.entity.title || "Untitled"}
            onOpen={(a) => router.push(`/entity/${a.entity.id}`)}
            onMove={(a, status) => moveTo.mutate({ id: a.entity.id, status })}
            renderCard={(a) => row(a, true)}
          />
        ) : (
          groups.map((group) => (
            <Band
              key={group.id}
              icon={null}
              title={group.title}
              count={group.items.length}
              initiallyOpen={group.id !== "done"}
            >
              <View>
                <ListGroup>
                  {group.items.map((a) => (
                    <ListItem key={a.entity.id}>{row(a)}</ListItem>
                  ))}
                </ListGroup>
              </View>
            </Band>
          ))
        )}
      </Screen>
    </>
  );
}
