import { IconCircleCheck, IconCircleDot, IconPlus, IconSubtask } from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { useCloseAfterSuccess } from "#/components/action-feedback.tsx";
import { labelsAction } from "#/components/context-menu/entity-actions.tsx";
import { PickerFeedback } from "#/components/context-menu/picker-feedback.tsx";
import {
  type EntityTarget,
  type MenuAction,
  registerActions,
  registerEntityType,
} from "#/components/context-menu/registry.ts";
import { EntityPickerList } from "#/components/entity-picker.tsx";
import {
  convertToSubtask,
  listTasks,
  listTaskStatuses,
  updateTaskStatus,
} from "#/lib/api/tasks.ts";
import type { Entity, Task, TaskStatus } from "#/lib/api/types.ts";

declare module "#/components/context-menu/registry.ts" {
  interface ContextTargets {
    /// The empty part of a board column: new tasks start in its status.
    "tasks.column": { status: TaskStatus; startCreate: () => void };
  }
}

interface TaskMenuRecord {
  entity: Entity;
  /// Unset for a sub-task, which Space-wide task lists don't include.
  task: Task | undefined;
  statuses: TaskStatus[] | undefined;
}

/// Both come from queries the Tasks views already keep warm.
function useTaskRecord(entity: Entity): TaskMenuRecord {
  const { data: tasks } = useQuery({
    queryKey: ["tasks", entity.spaceId],
    queryFn: () => listTasks(entity.spaceId),
    enabled: entity.type === "task",
  });
  const { data: statuses } = useQuery({ queryKey: ["task-statuses"], queryFn: listTaskStatuses });
  return {
    entity,
    task: tasks?.find((t) => t.entity.id === entity.id),
    statuses: statuses && [...statuses].sort((a, b) => a.position - b.position),
  };
}

/// The status that counts as finished: the highest doneness, first by position.
function doneStatus(statuses: TaskStatus[]): TaskStatus | undefined {
  return statuses.reduce<TaskStatus | undefined>(
    (best, status) => (!best || status.doneness > best.doneness ? status : best),
    undefined,
  );
}

function StatusDot({ status }: { status: TaskStatus }) {
  return (
    <span
      className="size-2 shrink-0 rounded-full bg-(--status-color)"
      // SAFETY: `--status-color` only ever receives `status.color`, a plain hex
      // string from the task-statuses API. `CSSProperties` just doesn't model it.
      style={{ "--status-color": status.color } as CSSProperties}
    />
  );
}

function ConvertToSubtaskPicker({
  entity,
  close,
  refresh,
}: {
  entity: Entity;
  close: () => void;
  refresh: () => Promise<void>;
}) {
  const convert = useMutation({
    mutationFn: async (parent: Entity) => {
      await convertToSubtask(entity.id, parent.id);
      await refresh();
    },
  });
  useCloseAfterSuccess(convert, close);
  return (
    <div className="flex flex-col">
      <EntityPickerList
        spaceId={entity.spaceId}
        typeFilter="task"
        exclude={entity.id}
        onSelect={(parent) => !convert.isPending && convert.mutate(parent)}
      />
      <PickerFeedback
        pending={convert.isPending}
        pendingLabel="Converting…"
        errorLabel={convert.isError ? convert.error.message || "Couldn't convert, try again" : null}
      />
    </div>
  );
}

const taskActions: MenuAction<EntityTarget<TaskMenuRecord>>[] = [
  {
    id: "status",
    group: "type",
    label: "Status",
    icon: IconCircleDot,
    useItems: ({ entity, record }) =>
      record?.statuses?.map((status) => ({
        id: status.id,
        label: status.name,
        icon: <StatusDot status={status} />,
        checked: record.task?.statusId === status.id,
        run: async (helpers) => {
          await updateTaskStatus(entity.id, status.id);
          await helpers.refresh();
        },
      })),
  },
  {
    id: "mark-done",
    group: "type",
    label: "Mark Done",
    icon: IconCircleCheck,
    when: ({ record }) => {
      const done = record?.statuses && doneStatus(record.statuses);
      return !done || record?.task?.statusId !== done.id;
    },
    run: async ({ entity, record }, helpers) => {
      const statuses = record?.statuses ?? (await listTaskStatuses());
      const done = doneStatus(statuses);
      if (!done) throw new Error("No statuses configured");
      await updateTaskStatus(entity.id, done.id);
      await helpers.refresh();
    },
  },
  labelsAction<TaskMenuRecord>(),
  {
    id: "convert-to-subtask",
    group: "type",
    label: "Convert to Sub-task of…",
    icon: IconSubtask,
    when: ({ entity }) => entity.type === "task",
    run: ({ entity }, helpers) =>
      helpers.openPopover((close) => (
        <ConvertToSubtaskPicker entity={entity} close={close} refresh={helpers.refresh} />
      )),
  },
];

registerEntityType<TaskMenuRecord>({
  types: ["task"],
  actions: taskActions,
  useRecord: useTaskRecord,
});

// A sub-task lives in its parent's Space and moves with it.
registerEntityType<TaskMenuRecord>({
  types: ["sub_task"],
  actions: taskActions,
  omit: ["move"],
  useRecord: useTaskRecord,
});

registerActions("tasks.column", [
  {
    id: "new-task",
    group: "create",
    label: ({ status }) => `New Task in ${status.name}`,
    icon: IconPlus,
    afterClose: true,
    run: ({ startCreate }) => startCreate(),
  },
]);
