import { IconChecklist, IconSchool, IconTag } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { entityFilterOption, type FilterField } from "#/components/filter-menu.tsx";
import { LabelChip, LabelDot } from "#/components/label-chip.tsx";
import { taskFilterFields } from "#/features/tasks/task-filter-fields.tsx";
import {
  type StatusKind,
  filterValues,
  orderTasks,
  sortStatuses,
  statusKind,
} from "#/features/tasks/task-model.ts";
import { listCourses } from "#/lib/api/courses.ts";
import { listLabels } from "#/lib/api/labels.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import { listTaskStatuses, listTasks, listTasksAll } from "#/lib/api/tasks.ts";
import type { Entity, Label, Space, Task, TaskStatus } from "#/lib/api/types.ts";
import { type EffortScale, effortLabel, useEffortSettings } from "#/lib/effort.ts";
import { qk } from "#/lib/query-keys.ts";
import {
  type BaseContext,
  dayField,
  keyField,
  numberField,
  relatedField,
  spaceField,
  statusField,
  timestampField,
  titleField,
} from "../fields.tsx";
import type { ViewField, ViewSource } from "../types.ts";

/// Tasks, as the view engine shows them. The fields mirror `TASK_FIELDS` in
/// `src-tauri/src/db/views.rs`, which checks the columns and conditions the CLI writes.

export interface TaskContext extends BaseContext {
  statuses: TaskStatus[];
  statusById: Map<string, TaskStatus>;
  labels: Label[];
  labelById: Map<string, Label>;
  courseById: Map<string, Entity>;
  kindOf: (statusId: string) => StatusKind;
  effortScale: EffortScale;
}

export function taskContext({
  statuses: raw,
  labels,
  courses,
  spaces,
  effortScale,
}: {
  statuses: TaskStatus[];
  labels: Label[];
  courses: Entity[];
  spaces: Space[];
  effortScale: EffortScale;
}): TaskContext {
  const statuses = sortStatuses(raw);
  const statusById = new Map(statuses.map((s) => [s.id, s]));
  return {
    statuses,
    statusById,
    labels,
    labelById: new Map(labels.map((l) => [l.id, l])),
    courseById: new Map(courses.map((c) => [c.id, c])),
    spaces: new Map(spaces.map((s) => [s.id, s])),
    kindOf: (id) => {
      const status = statusById.get(id);
      return status ? statusKind(status, statuses) : "unstarted";
    },
    effortScale,
  };
}

const entityOf = (task: Task) => task.entity;

const labelsOf = (task: Task, ctx: TaskContext) =>
  task.labelIds.flatMap((id) => ctx.labelById.get(id) ?? []);

export const TASK_FIELDS: ViewField<Task, TaskContext>[] = [
  keyField(entityOf),
  titleField(entityOf),
  statusField(
    (task, ctx) => {
      const status = ctx.statusById.get(task.statusId);
      return status && { status, kind: ctx.kindOf(status.id) };
    },
    (task) => task.statusId,
  ),
  {
    id: "labels",
    label: "Labels",
    kind: "entity",
    value: (task) => task.labelIds,
    text: (task, ctx) =>
      labelsOf(task, ctx)
        .map((l) => l.name)
        .join(", "),
    cell: (task, ctx) => (
      <span className="flex min-w-0 items-center gap-1">
        {labelsOf(task, ctx).map((label) => (
          <LabelChip key={label.id} label={label} />
        ))}
      </span>
    ),
  },
  dayField("start", "Start date", (task) => task.startDate),
  dayField("due", "Due date", (task) => task.dueDate),
  {
    ...numberField<Task, TaskContext>("effort", "Effort", (task) => task.effort),
    text: (task, ctx) => (task.effort === null ? "" : effortLabel(task.effort, ctx.effortScale)),
  },
  relatedField({
    id: "course",
    label: "Course",
    relationship: "relates-to",
    lookup: (task, ctx) => task.courseIds.flatMap((id) => ctx.courseById.get(id) ?? []),
  }),
  dayField("completedAt", "Completed", (task) => task.completedAt),
  spaceField(entityOf),
  timestampField("created", entityOf),
  timestampField("updated", entityOf),
];

function useTaskData(spaceId: string | null) {
  const tasks = useQuery({
    queryKey: spaceId ? qk.tasks.bySpace(spaceId) : qk.tasks.all,
    queryFn: () => (spaceId ? listTasks(spaceId) : listTasksAll()),
  });
  const { data: statuses = [] } = useQuery({
    queryKey: qk.tasks.statuses,
    queryFn: listTaskStatuses,
  });
  // Labels and Courses belong to one Space, so a cross-Space view goes without them.
  const { data: labels = [] } = useQuery({
    queryKey: qk.labels.bySpace(spaceId ?? ""),
    queryFn: () => listLabels(spaceId ?? ""),
    enabled: !!spaceId,
  });
  const { data: courses = [] } = useQuery({
    queryKey: qk.courses.bySpace(spaceId ?? ""),
    queryFn: () => listCourses(spaceId ?? ""),
    enabled: !!spaceId,
  });
  const { data: spaces = [] } = useQuery({ queryKey: qk.spaces, queryFn: listSpaces });
  const effortScale = useEffortSettings((s) => s.scale);
  const ctx = useMemo(
    () => taskContext({ statuses, labels, courses, spaces, effortScale }),
    [statuses, labels, courses, spaces, effortScale],
  );
  return { items: tasks.data ?? [], ctx, isPending: tasks.isPending };
}

export const taskSource: ViewSource<Task, TaskContext> = {
  type: "task",
  label: "Tasks",
  itemLabel: "task",
  icon: IconChecklist,
  entityOf,
  useData: useTaskData,
  fields: TASK_FIELDS,
  filterFields: (ctx, tasks) => {
    const fields: FilterField[] = taskFilterFields(ctx.statuses, ctx.kindOf, ctx.effortScale);
    const courses = [...ctx.courseById.values()].filter((c) =>
      tasks.some((t) => t.courseIds.includes(c.id)),
    );
    if (courses.length > 0) {
      fields.push({
        id: "course",
        label: "Course",
        icon: IconSchool,
        options: courses.map(entityFilterOption),
      });
    }
    const labels = ctx.labels.filter((l) => tasks.some((t) => t.labelIds.includes(l.id)));
    if (labels.length > 0) {
      fields.push({
        id: "labels",
        label: "Labels",
        icon: IconTag,
        options: labels.map((l) => ({ value: l.id, label: l.name, icon: <LabelDot label={l} /> })),
      });
    }
    return fields;
  },
  filterValue: (task, fieldId) => filterValues(task, fieldId),
  order: (tasks, ctx) => orderTasks(tasks, "due", ctx.statuses),
  defaultColumns: ["key", "title", "status", "labels", "due", "effort"],
};
