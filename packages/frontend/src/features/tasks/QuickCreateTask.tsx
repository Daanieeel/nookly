import { useCreateLabel } from "#/components/label-manager.tsx";
import { fieldMessage } from "#/components/form-field.tsx";
import { IconCalendarEvent, IconLink, IconX } from "@tabler/icons-react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { FieldError, StatusButtonContent, useActionStatus } from "#/components/action-feedback.tsx";
import { LabelChip } from "#/components/label-chip.tsx";
import { Button } from "@nookly/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import { EntityIcon } from "#/components/entity-icon.tsx";
import { EntityPickerPopover } from "#/components/entity-picker.tsx";
import { createRelationship } from "#/lib/api/relationships.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { attachLabel } from "#/lib/api/labels.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import { createTask, updateTaskStatus } from "#/lib/api/tasks.ts";
import type { Entity, Space, Task } from "#/lib/api/types.ts";
import { cn } from "@nookly/ui/lib/utils";
import { sortStatuses } from "./task-model";
import { useTasksData } from "./task-controls";
import {
  DueDatePicker,
  DueLabel,
  LabelsPicker,
  LabelsPlaceholder,
  PROPERTY_PILL,
  StatusPicker,
  TaskStatusIcon,
} from "./task-properties";
import { qk } from "#/lib/query-keys.ts";
import {
  CreateMoreSwitch,
  NewEntityBreadcrumb,
  NewEntityDialog,
} from "#/components/new-entity-dialog.tsx";

/// What a new task starts with, e.g. the status of the column its "+" sits in.
export interface TaskDraft {
  statusId?: string;
  labelIds?: string[];
  /// What the task starts out related to, e.g. the Course the list is filtered to.
  related?: Entity;
}

const taskSchema = z.object({
  title: z.string().trim().min(1, "Give the task a title"),
  statusId: z.string().optional(),
  labelIds: z.array(z.string()),
  dueDate: z.string().nullable(),
  related: z.custom<Entity>().nullable(),
});

type NewTask = z.infer<typeof taskSchema>;

const emptyValues: NewTask = {
  title: "",
  statusId: undefined,
  labelIds: [],
  dueDate: null,
  related: null,
};

/// Linear's "New issue" modal, cut down to the title and three property pills
/// (status, labels, due date). Enter or Cmd+Enter creates; with "Create more" on
/// the modal stays open, cleared and focused, for the next one.
export function QuickCreateTask({
  open,
  draft,
  spaces,
  onSpaceChange,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  draft: TaskDraft;
  /// Set on the cross-Space overview: the Space chip then picks which Space the task
  /// goes to (the page provides that Space's `TasksData`; `onSpaceChange` switches it).
  spaces?: Space[];
  onSpaceChange?: (spaceId: string) => void;
  onOpenChange: (open: boolean) => void;
  onCreated: (task: Task) => void;
}) {
  const queryClient = useQueryClient();
  const { spaceId, statuses, labels, statusById, labelById, kindOf } = useTasksData();
  const { data: allSpaces = [] } = useQuery({ queryKey: qk.spaces, queryFn: listSpaces });
  const space = allSpaces.find((s) => s.id === spaceId);

  const form = useForm({
    defaultValues: emptyValues,
    validators: { onChange: taskSchema },
    onSubmit: ({ value }) => {
      if (!create.isPending) create.mutate({ ...value, title: value.title.trim() });
    },
  });
  const [createMore, setCreateMore] = useState(false);
  const newLabel = useCreateLabel(spaceId);
  const titleRef = useRef<HTMLInputElement>(null);

  // Each opening starts from the draft of whatever opened it.
  useEffect(() => {
    if (!open) return;
    form.reset({
      title: "",
      // Backlog unless whatever opened it says otherwise; without one, the first status.
      statusId:
        draft.statusId ??
        (statuses.find((s) => kindOf(s.id) === "backlog") ?? sortStatuses(statuses)[0])?.id,
      labelIds: draft.labelIds ?? [],
      dueDate: null,
      related: draft.related ?? null,
    });
  }, [open, draft, statuses, kindOf, form]);

  const create = useMutation({
    mutationFn: async (vars: NewTask) => {
      const task = await createTask(spaceId, vars.title, null, vars.dueDate);
      if (vars.statusId && vars.statusId !== task.statusId) {
        await updateTaskStatus(task.entity.id, vars.statusId);
      }
      await Promise.all(vars.labelIds.map((id) => attachLabel(task.entity.id, id)));
      // An entity picked in another Space (the Space chip changed since) is not linked.
      if (vars.related && vars.related.spaceId === spaceId) {
        await createRelationship(task.entity.id, vars.related.id, "relates-to");
        await queryClient.invalidateQueries({ queryKey: qk.relationships.of(vars.related.id) });
      }
      await queryClient.invalidateQueries({ queryKey: qk.tasks.bySpace(spaceId) });
      await queryClient.invalidateQueries({ queryKey: qk.tasks.all });
      return task;
    },
    onSuccess: (task) => {
      onCreated(task);
      if (createMore) {
        form.setFieldValue("title", "");
        requestAnimationFrame(() => titleRef.current?.focus());
      } else {
        onOpenChange(false);
      }
    },
  });
  const createStatus = useActionStatus(create);

  return (
    <NewEntityDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) create.reset();
      }}
      titleRef={titleRef}
      onSubmit={() => void form.handleSubmit()}
    >
      <NewEntityBreadcrumb
        spaceId={spaceId}
        spaceName={space?.name ?? "Tasks"}
        space={space}
        spaces={spaces}
        onSpaceChange={onSpaceChange}
        title="New task"
        description="Give the task a title, then set its status, labels, due date and what it relates to."
      />

      <form.Field name="title">
        {(field) => (
          <input
            ref={titleRef}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(e) => field.handleChange(e.target.value)}
            placeholder="Task title"
            aria-label="Task title"
            aria-invalid={create.isError || !!fieldMessage(field) || undefined}
            className="w-full bg-transparent px-4 pt-4 pb-3 text-lg font-medium outline-none placeholder:text-muted-foreground/60"
          />
        )}
      </form.Field>
      <form.Field name="title">
        {(field) => (
          <div className="px-4 pb-2 empty:hidden">
            <FieldError message={fieldMessage(field)} />
          </div>
        )}
      </form.Field>

      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-4">
        <form.Subscribe selector={(state) => state.values}>
          {({ statusId, labelIds, dueDate, related: picked }) => {
            const related = picked && picked.spaceId === spaceId ? picked : null;
            const status = statusId ? statusById.get(statusId) : undefined;
            const chosenLabels = labelIds.flatMap((id) => labelById.get(id) ?? []);
            return (
              <>
                <StatusPicker
                  statuses={statuses}
                  kindOf={kindOf}
                  value={statusId}
                  onSelect={(id) => form.setFieldValue("statusId", id)}
                >
                  <button type="button" className={PROPERTY_PILL} aria-label="Change Status">
                    {status && <TaskStatusIcon status={status} kind={kindOf(status.id)} />}
                    <span className="truncate text-foreground">{status?.name ?? "Status"}</span>
                  </button>
                </StatusPicker>

                <LabelsPicker
                  labels={labels}
                  selected={labelIds}
                  onToggle={(id) =>
                    form.setFieldValue("labelIds", (prev) =>
                      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id],
                    )
                  }
                  onCreate={(name) =>
                    newLabel.mutate(name, {
                      onSuccess: (label) =>
                        form.setFieldValue("labelIds", (prev) => [...prev, label.id]),
                    })
                  }
                  creating={newLabel.isPending}
                >
                  <button
                    type="button"
                    aria-label="Change Labels"
                    className={cn(
                      PROPERTY_PILL,
                      chosenLabels.length > 0 && "max-w-none border-none px-0",
                    )}
                  >
                    {chosenLabels.length > 0 ? (
                      chosenLabels.map((l) => (
                        <LabelChip
                          key={l.id}
                          label={l}
                          className="h-6 rounded-full border-foreground/10"
                        />
                      ))
                    ) : (
                      <LabelsPlaceholder />
                    )}
                  </button>
                </LabelsPicker>

                <DueDatePicker
                  value={dueDate}
                  onSelect={(day) => form.setFieldValue("dueDate", day)}
                >
                  <button type="button" className={PROPERTY_PILL} aria-label="Change Due Date">
                    {dueDate ? (
                      <DueLabel day={dueDate} tone={null} />
                    ) : (
                      <>
                        <IconCalendarEvent size={14} className="shrink-0" />
                        Due date
                      </>
                    )}
                  </button>
                </DueDatePicker>

                <EntityPickerPopover
                  spaceId={spaceId}
                  onSelect={(entity) => form.setFieldValue("related", entity)}
                  trigger={
                    <button type="button" className={PROPERTY_PILL} aria-label="Change Related">
                      {related ? (
                        <>
                          <EntityIcon entity={related} size={14} className="shrink-0" />
                          <span className="truncate text-foreground">{displayTitle(related)}</span>
                        </>
                      ) : (
                        <>
                          <IconLink size={14} className="shrink-0" />
                          Related to
                        </>
                      )}
                    </button>
                  }
                />
                {related && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="Clear Related"
                        onClick={() => form.setFieldValue("related", null)}
                        className="-ml-1 flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <IconX size={12} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Clear Related</TooltipContent>
                  </Tooltip>
                )}
              </>
            );
          }}
        </form.Subscribe>
      </div>

      <div className="flex items-center gap-3 border-t border-border px-4 py-3">
        <div className="mr-auto">
          <FieldError message={create.isError && "Couldn't create the task, try again"} />
        </div>
        <CreateMoreSwitch
          id="create-more-tasks"
          checked={createMore}
          onCheckedChange={setCreateMore}
        />
        <Button type="submit" size="sm">
          <StatusButtonContent
            status={createStatus}
            label="Create task"
            successLabel="Created"
            errorLabel="Try again"
          />
        </Button>
      </div>
    </NewEntityDialog>
  );
}
