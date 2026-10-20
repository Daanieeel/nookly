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
  IconCalendarPlus,
  IconCircleDot,
  IconGauge,
  IconPlus,
  IconRepeat,
} from "@tabler/icons-react-native";
import { useState } from "react";
import { TextInput, View } from "react-native";
import { useLocalWrite } from "../data/context.tsx";
import { useSetting } from "../data/settings.ts";
import { useStatuses, useSubtaskProgress, useSubtasks, useTask } from "../data/queries.ts";
import { Button, statusOf } from "../ui/Button.tsx";
import { DetailsPart, MainPart } from "../ui/parts.tsx";
import { PropertyList } from "../ui/Property.tsx";
import { ChoiceProperty, DayProperty } from "../ui/property-rows.tsx";
import { Section } from "../ui/Row.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { addDays, localDay } from "./dates.ts";
import { PageEditor } from "./PageEditor.tsx";
import { StatusIcon, TaskRow } from "./TaskRow.tsx";

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
      {subtasks.map((task) => (
        <View key={task.entity.id}>
          <TaskRow task={task} statuses={statuses} />
        </View>
      ))}
      {!readOnly ? (
        <View className="min-h-12 flex-row items-center gap-2 px-4">
          <IconPlus size={18} color={theme.colors.mutedForeground} />
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

/// A task's properties, one card of rows: tap a row to change it.
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
  const repeatId =
    REPEATS.find((r) => JSON.stringify(r.rule) === JSON.stringify(task.repeat))?.label ?? "Custom";
  return (
    <PropertyList>
      <ChoiceProperty
        name="status"
        icon={<IconCircleDot size={20} color={muted} />}
        label="Status"
        value={task.statusId}
        readOnly={readOnly}
        options={statuses.map((s) => ({
          id: s.id,
          label: s.name,
          icon: <StatusIcon status={s} size={16} />,
        }))}
        onChange={(statusId) => status.mutate(statusId)}
      />
      <ChoiceProperty
        name="effort"
        icon={<IconGauge size={20} color={muted} />}
        label="Effort"
        value={task.effort === null ? "none" : String(task.effort)}
        readOnly={readOnly}
        options={[
          { id: "none", label: "None" },
          ...EFFORT_STEPS.map((step) => ({
            id: String(step.value),
            label: effortLabel(step.value, scale),
          })),
        ]}
        onChange={(value) => effort.mutate(value === "none" ? null : Number(value))}
      />
      <DayProperty
        name="start"
        icon={<IconCalendarPlus size={20} color={muted} />}
        label="Start date"
        value={task.startDate}
        readOnly={readOnly}
        onChange={(day) => start.mutate(day)}
      />
      <DayProperty
        name="due"
        icon={<IconCalendarDue size={20} color={muted} />}
        label="Due date"
        value={task.dueDate}
        readOnly={readOnly}
        quick={[
          { label: "Today", value: localDay() },
          { label: "Tomorrow", value: addDays(localDay(), 1) },
        ]}
        onChange={(day) => dates.mutate(day)}
      />
      <ChoiceProperty
        name="repeat"
        icon={<IconRepeat size={20} color={muted} />}
        label="Repeat"
        value={repeatId}
        readOnly={readOnly}
        options={REPEATS.map((r) => ({ id: r.label, label: r.label }))}
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
