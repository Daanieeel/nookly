import { statusOption } from "./option-badges.tsx";
import {
  type RepeatRule,
  createSubtask,
  setTaskDates,
  setTaskEffort,
  setTaskRepeat,
  setTaskStatus,
} from "@nookly/shared/data";
import { EFFORT_STEPS, effortLabel } from "@nookly/shared/effort";
import {
  IconCalendarDue,
  IconChevronDown,
  IconChevronUp,
  IconCalendarPlus,
  IconCircleDot,
  IconGauge,
  IconPlus,
  IconRepeat,
  IconX,
} from "@tabler/icons-react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { TextInput, View } from "react-native";
import { useLocalWrite } from "../data/context.tsx";
import { useSetting } from "../data/settings.ts";
import {
  useStatuses,
  useSubtaskProgress,
  useSubtasks,
  useTask,
  useTasks,
} from "../data/queries.ts";
import { Button, IconButton, statusOf } from "../ui/Button.tsx";
import { AtAGlance, DetailsPart, MainPart } from "../ui/parts.tsx";
import { PropertyList } from "../ui/Property.tsx";
import { ChoiceProperty, DayProperty } from "../ui/property-rows.tsx";
import { Section } from "../ui/Row.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { addDays, localDay } from "./dates.ts";
import { orderTasks } from "./task-view.ts";
import { ListGroup } from "../ui/ListMotion.tsx";
import { PageEditor } from "./PageEditor.tsx";
import { TaskRow } from "./TaskRow.tsx";
import { CONTROL_SIZE, gapBetween } from "../ui/touch.ts";
import { UiIcon } from "../ui/kit/UiIcon.tsx";

const REPEATS: { label: string; rule: RepeatRule | null }[] = [
  { label: "Never", rule: null },
  { label: "Daily", rule: { every: 1, unit: "day" } },
  { label: "Weekly", rule: { every: 1, unit: "week" } },
  { label: "Monthly", rule: { every: 1, unit: "month" } },
];

/// A task's sub-tasks, one level deep, with how far along they are.
function Subtasks({ id, readOnly }: { id: string; readOnly: boolean }) {
  const theme = useTheme();
  const { data: subtasks = [] } = useSubtasks(id);
  const { data: statuses = [] } = useStatuses();
  const { data: progress } = useSubtaskProgress(id);
  const [title, setTitle] = useState("");
  const add = useLocalWrite((db, text: string) => createSubtask(db, id, text));
  const submit = () => {
    const text = title.trim();
    if (text) add.mutate(text, { onSuccess: () => setTitle("") });
  };
  return (
    <Section
      title="Sub-tasks"
      action={
        progress === null || progress === undefined ? undefined : (
          <Text variant="small" tone="muted">
            {Math.round(progress)}% done
          </Text>
        )
      }
    >
      <ListGroup>
        {subtasks.map((task) => (
          <TaskRow key={task.entity.id} task={task} statuses={statuses} />
        ))}
      </ListGroup>
      {!readOnly ? (
        <View className="min-h-12 flex-row items-center gap-2 px-4">
          <UiIcon icon={IconPlus} size={18} color={theme.colors.mutedForeground} />
          <TextInput
            accessibilityLabel="New sub-task"
            value={title}
            onChangeText={setTitle}
            onSubmitEditing={submit}
            returnKeyType="done"
            placeholder="Add a sub-task"
            placeholderTextColor={theme.colors.mutedForeground}
            className="h-12 flex-1 font-sans text-sm text-foreground"
          />
          {title.trim() ? (
            <Button
              label="Add Sub-task"
              variant="secondary"
              size="sm"
              status={statusOf(add)}
              errorLabel="Couldn't add"
              onPress={submit}
            />
          ) : null}
        </View>
      ) : null}
    </Section>
  );
}

/// A task's properties, one card of rows (or chips at a glance): tap one to change it.
function TaskProperties({ id, readOnly }: { id: string; readOnly: boolean }) {
  const theme = useTheme();
  const { data: task } = useTask(id);
  const { data: statuses = [] } = useStatuses();
  const status = useLocalWrite((db, statusId: string) => setTaskStatus(db, id, statusId));
  const dates = useLocalWrite((db, due: string | null) =>
    setTaskDates(db, id, task?.startDate ?? null, due),
  );
  const start = useLocalWrite((db, day: string | null) =>
    setTaskDates(db, id, day, task?.dueDate ?? null),
  );
  const effort = useLocalWrite((db, value: number | null) => setTaskEffort(db, id, value));
  const [scale] = useSetting("general.effortScale");
  const repeat = useLocalWrite((db, rule: RepeatRule | null) => setTaskRepeat(db, id, rule));
  if (!task) return null;
  const muted = theme.colors.mutedForeground;
  const finished = (statuses.find((s) => s.id === task.statusId)?.doneness ?? 0) >= 100;
  const late = !finished && task.dueDate !== null && task.dueDate.slice(0, 10) < localDay();
  const repeatId =
    REPEATS.find((r) => JSON.stringify(r.rule) === JSON.stringify(task.repeat))?.label ?? "Custom";
  return (
    <PropertyList>
      <ChoiceProperty
        icon={<IconCircleDot size={20} color={muted} />}
        label="Status"
        value={task.statusId}
        readOnly={readOnly}
        options={statuses.map(statusOption)}
        onChange={(statusId) => status.mutate(statusId)}
      />
      <ChoiceProperty
        icon={<UiIcon icon={IconGauge} size={20} color={muted} />}
        label="Effort"
        searchPlaceholder="Set effort…"
        value={task.effort === null ? "none" : String(task.effort)}
        readOnly={readOnly}
        options={[
          ...EFFORT_STEPS.map((step) => ({
            id: String(step.value),
            label: effortLabel(step.value, scale),
          })),
          ...(task.effort === null
            ? []
            : [
                {
                  id: "none",
                  label: "Remove effort",
                  icon: <IconX size={16} color={muted} />,
                  separatorBefore: true,
                },
              ]),
        ]}
        emptyId="none"
        onChange={(value) => effort.mutate(value === "none" ? null : Number(value))}
      />
      <DayProperty
        icon={<UiIcon icon={IconCalendarPlus} size={20} color={muted} />}
        label="Start date"
        value={task.startDate}
        readOnly={readOnly}
        onChange={(day) => start.mutate(day)}
      />
      <DayProperty
        icon={
          <UiIcon
            icon={IconCalendarDue}
            size={20}
            color={late ? theme.colors.destructive : muted}
          />
        }
        label="Due date"
        value={task.dueDate}
        valueTone={late ? "destructive" : undefined}
        readOnly={readOnly}
        quick={[
          { label: "Today", value: localDay() },
          { label: "Tomorrow", value: addDays(localDay(), 1) },
        ]}
        onChange={(day) => dates.mutate(day)}
      />
      <ChoiceProperty
        icon={<UiIcon icon={IconRepeat} size={20} color={muted} />}
        label="Repeat"
        value={repeatId}
        readOnly={readOnly}
        options={REPEATS.map((r) => ({ id: r.label, label: r.label }))}
        emptyId="Never"
        onChange={(label) => repeat.mutate(REPEATS.find((r) => r.label === label)?.rule ?? null)}
      />
    </PropertyList>
  );
}

/// A task or sub-task: its description and sub-tasks in the page, its properties in the
/// details.
export function TaskItem({ id, readOnly, sub }: { id: string; readOnly: boolean; sub: boolean }) {
  return (
    <>
      <AtAGlance>
        <TaskProperties id={id} readOnly={readOnly} />
      </AtAGlance>
      <MainPart>
        <PageEditor entityId={id} readOnly={readOnly} live={false} />
        {sub ? null : <Subtasks id={id} readOnly={readOnly} />}
      </MainPart>
      <DetailsPart>
        <TaskProperties id={id} readOnly={readOnly} />
      </DetailsPart>
    </>
  );
}

/// The small stepper in the header of a task: where it stands among its Space's open tasks
/// in the order of the list ("3 / 12") and arrows to the one before and after.
export function TaskStepper({ id, spaceId }: { id: string; spaceId: string }) {
  const theme = useTheme();
  const router = useRouter();
  const { data: tasks = [] } = useTasks(spaceId);
  const { data: statuses = [] } = useStatuses();
  const order = orderTasks(
    tasks.filter(
      (t) =>
        t.entity.type === "task" &&
        ((statuses.find((s) => s.id === t.statusId)?.doneness ?? 0) < 100 || t.entity.id === id),
    ),
    "due",
    statuses,
  );
  const index = order.findIndex((t) => t.entity.id === id);
  if (index < 0 || order.length < 2) return null;
  const go = (to: number) => router.replace(`/entity/${order[to].entity.id}`);
  return (
    <View className="flex-row items-center" style={{ gap: gapBetween(CONTROL_SIZE.iconSm) }}>
      <Text variant="small" tone="muted">
        {`${index + 1} / ${order.length}`}
      </Text>
      <IconButton
        label="Previous Task"
        size="iconSm"
        icon={<UiIcon icon={IconChevronUp} size={16} color={theme.colors.mutedForeground} />}
        onPress={() => index > 0 && go(index - 1)}
      />
      <IconButton
        label="Next Task"
        size="iconSm"
        icon={<UiIcon icon={IconChevronDown} size={16} color={theme.colors.mutedForeground} />}
        onPress={() => index < order.length - 1 && go(index + 1)}
      />
    </View>
  );
}
