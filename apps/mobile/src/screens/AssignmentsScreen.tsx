import { ASSIGNMENT_STATUSES } from "@nookly/shared/colors";
import { useEntityMenu } from "./entity-actions.tsx";
import { type AssignmentRecord, updateAssignment } from "@nookly/shared/data";
import { CARD_CLASSES } from "@nookly/ui/classes";
import { IconCheck, IconLayoutKanban, IconList, IconPlus } from "@tabler/icons-react-native";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { z } from "zod";
import { useLocalWrite } from "../data/context.tsx";
import { usePreference } from "../data/preferences.ts";
import { useAssignments, useCourses, useSpaces } from "../data/queries.ts";
import { Band } from "../ui/Band.tsx";
import { SpaceDot } from "../ui/Badge.tsx";
import { Button, IconButton } from "../ui/Button.tsx";
import { cn } from "../ui/classes.ts";
import { ListTitle } from "../ui/ListBar.tsx";
import { ROW_DIVIDER } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { FilterField, LayoutTiles, SelectRow } from "../ui/sheet/DisplayParts.tsx";
import { Sheet } from "../ui/sheet/Sheet.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import {
  ASSIGNMENT_GROUPINGS,
  type AssignmentGroup,
  groupAssignments,
  isHandedIn,
} from "./assignment-view.ts";
import { dueText } from "./dashboard-model.ts";
import { dayLabel, localDay } from "./dates.ts";
import { StatusIcon } from "./TaskRow.tsx";
import { CONTROL_SIZE, touchSlop } from "../ui/touch.ts";

/// Assignments that no longer wait on the student: handed in, or graded.
export const ASSIGNMENT_DONE = new Set(["submitted", "graded"]);

const displaySchema = z.object({
  layout: z.enum(["list", "board"]),
  grouping: z.enum(["due", "course", "status", "space"]),
  /// Course and status ids the list is narrowed to; empty means all.
  courses: z.array(z.string()),
  statuses: z.array(z.string()),
});
type Display = z.infer<typeof displaySchema>;
const DEFAULT: Display = { layout: "list", grouping: "due", courses: [], statuses: [] };

function Row({
  assignment,
  courseName,
  spaceName,
  spaceColor,
  today,
}: {
  assignment: AssignmentRecord;
  courseName?: string;
  spaceName?: string;
  spaceColor?: string;
  today: string;
}) {
  const entityMenu = useEntityMenu();
  const router = useRouter();
  const theme = useTheme();
  const done = isHandedIn(assignment);
  const mark = useLocalWrite((db, next: string) =>
    updateAssignment(db, assignment.entity.id, { status: next }),
  );
  const due = assignment.dueDate && !done ? dueText(assignment.dueDate.slice(0, 10), today) : null;
  return (
    <View
      className={cn("flex-row items-center gap-3 px-4 py-2", ROW_DIVIDER, done && "opacity-60")}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={`${done ? "Reopen" : "Mark done"} ${assignment.entity.title || "assignment"}`}
        hitSlop={touchSlop(CONTROL_SIZE.check)}
        onPress={() => mark.mutate(done ? "not_started" : "submitted")}
        className={cn(
          "size-6 items-center justify-center rounded-full border",
          done ? "border-positive bg-positive" : "border-border",
        )}
      >
        {done ? <IconCheck size={14} color={theme.colors.background} /> : null}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${assignment.entity.title || "Untitled"}, ${assignment.entity.key}`}
        onPress={() => router.push(`/entity/${assignment.entity.id}`)}
        onLongPress={() => entityMenu(assignment.entity)}
        className="min-h-11 flex-1 justify-center gap-1 active:opacity-70"
      >
        <Text numberOfLines={1}>{assignment.entity.title || "Untitled"}</Text>
        <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
          <Text variant="small" tone="muted">
            {assignment.entity.key}
          </Text>
          {assignment.dueDate ? (
            <Text variant="small" tone="muted">
              {dayLabel(assignment.dueDate)}
            </Text>
          ) : null}
          {due ? (
            <Text
              variant="small"
              tone={due.overdue ? "destructive" : due.text === "Today" ? "caution" : "muted"}
            >
              {due.text}
            </Text>
          ) : null}
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
      </Pressable>
    </View>
  );
}

/// Assignments of one Space or of every Space, grouped by deadline as the desktop's overview
/// does (overdue, today, this week, next week, later, no due date, and what is done), or by
/// course, status or Space, narrowed by course and status, or laid out as a board by status.
export function AssignmentsScreen({ spaceId = null }: { spaceId?: string | null }) {
  const theme = useTheme();
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
  const groups: AssignmentGroup[] = groupAssignments(shown, grouping, {
    today,
    courseName,
    spaceName: (id) => spaceOf(id)?.name,
  });
  const newOne = () =>
    router.push(spaceId ? `/new/assignment?spaceId=${spaceId}` : "/new/assignment");
  const row = (a: AssignmentRecord) => (
    <Row
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
          headerRight: () => (
            <IconButton
              label="New Assignment"
              icon={<IconPlus size={22} color={theme.colors.foreground} />}
              onPress={newOne}
            />
          ),
        }}
      />
      <Screen wide={display.layout === "board"}>
        <ListTitle title="Assignments" count={all.length} />
        <View className="flex-row items-center gap-2">
          <Button
            label="Filter"
            variant={panel === "filter" ? "secondary" : "ghost"}
            size="sm"
            onPress={() => setPanel((p) => (p === "filter" ? null : "filter"))}
          />
          <Button
            label="Display"
            variant={panel === "display" ? "secondary" : "ghost"}
            size="sm"
            onPress={() => setPanel((p) => (p === "display" ? null : "display"))}
          />
        </View>
        <Sheet
          open={panel === "filter"}
          onOpenChange={(open) => !open && setPanel(null)}
          title="Filter"
        >
          <View>
            <FilterField
              label="Course"
              values={display.courses}
              options={courses.map((c) => ({
                id: c.entity.id,
                label: c.entity.title || "Untitled",
              }))}
              onChange={(next) => setDisplay({ ...display, courses: next })}
            />
            <FilterField
              label="Status"
              values={display.statuses}
              options={ASSIGNMENT_STATUSES.map((s) => ({
                id: s.id,
                label: s.name,
                icon: <StatusIcon status={s} size={16} />,
              }))}
              onChange={(next) => setDisplay({ ...display, statuses: next })}
            />
          </View>
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
            {display.layout === "list" ? (
              <SelectRow
                label="Grouping"
                value={display.grouping}
                options={[...ASSIGNMENT_GROUPINGS]}
                onChange={(grouping) => setDisplay({ ...display, grouping })}
              />
            ) : null}
          </View>
        </Sheet>
        {all.length === 0 ? (
          <Text tone="muted">No assignments yet. Add them to a course.</Text>
        ) : null}
        {all.length > 0 && groups.length === 0 ? (
          <Text tone="muted">Nothing matches these filters.</Text>
        ) : null}
        {display.layout === "board" ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-3"
          >
            {groups.map((group) => (
              <View
                key={group.id}
                className="w-72 gap-1"
                accessibilityLabel={`${group.title} column`}
              >
                <View className="flex-row items-center gap-2 px-1">
                  <StatusIcon
                    status={ASSIGNMENT_STATUSES.find((s) => s.id === group.id)}
                    size={16}
                  />
                  <Text className="font-medium">{group.title}</Text>
                  <Text tone="muted">{group.items.length}</Text>
                </View>
                <View className={cn(CARD_CLASSES, "gap-0 overflow-hidden")}>
                  <View className="-mb-px">
                    {group.items.map((a) => (
                      <View key={a.entity.id}>{row(a)}</View>
                    ))}
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>
        ) : (
          groups.map((group) => (
            <Band
              key={group.id}
              icon={null}
              title={group.title}
              count={group.items.length}
              initiallyOpen={group.id !== "done"}
            >
              <View className={cn(CARD_CLASSES, "gap-0 overflow-hidden")}>
                <View className="-mb-px">
                  {group.items.map((a) => (
                    <View key={a.entity.id}>{row(a)}</View>
                  ))}
                </View>
              </View>
            </Band>
          ))
        )}
      </Screen>
    </>
  );
}
