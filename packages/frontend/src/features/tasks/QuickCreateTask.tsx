import { useCreateLabel } from "#/components/label-manager.tsx";
import { IconCalendarEvent, IconChevronRight } from "@tabler/icons-react";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { FieldError, StatusButtonContent, useActionStatus } from "#/components/action-feedback.tsx";
import { SpaceDot } from "#/components/space-chip.tsx";
import { LabelChip } from "#/components/label-chip.tsx";
import { Button } from "@nookly/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nookly/ui/components/select";
import { Switch } from "@nookly/ui/components/switch";
import { attachLabel } from "#/lib/api/labels.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import { createTask, updateTaskStatus } from "#/lib/api/tasks.ts";
import type { Space, Task } from "#/lib/api/types.ts";
import { cn } from "@nookly/ui/lib/utils";
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

/// What a new task starts with, e.g. the status of the column its "+" sits in.
export interface TaskDraft {
  statusId?: string;
  labelIds?: string[];
}

const taskSchema = z.object({
  title: z.string().trim().min(1),
  statusId: z.string().optional(),
  labelIds: z.array(z.string()),
  dueDate: z.string().nullable(),
});

type NewTask = z.infer<typeof taskSchema>;

const emptyValues: NewTask = { title: "", statusId: undefined, labelIds: [], dueDate: null };

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
      statusId: draft.statusId ?? statuses[0]?.id,
      labelIds: draft.labelIds ?? [],
      dueDate: null,
    });
  }, [open, draft, statuses, form]);

  const create = useMutation({
    mutationFn: async (vars: NewTask) => {
      const task = await createTask(spaceId, vars.title, null, vars.dueDate);
      if (vars.statusId && vars.statusId !== task.statusId) {
        await updateTaskStatus(task.entity.id, vars.statusId);
      }
      await Promise.all(vars.labelIds.map((id) => attachLabel(task.entity.id, id)));
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) create.reset();
      }}
    >
      <DialogContent
        className="max-w-2xl gap-0 p-0"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          titleRef.current?.focus();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void form.handleSubmit();
          }
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <div className="flex items-center gap-1.5 px-4 pt-4 text-xs text-muted-foreground">
            {spaces && onSpaceChange ? (
              <Select value={spaceId} onValueChange={onSpaceChange}>
                <SelectTrigger size="sm" className="h-6 w-auto gap-1.5" aria-label="Space">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {spaces.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      <SpaceDot space={option} />
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="inline-flex h-6 items-center rounded-md border border-border px-2 font-medium text-foreground">
                {space?.name ?? "Tasks"}
              </span>
            )}
            <IconChevronRight size={12} />
            <span className="text-foreground">
              <DialogTitle className="text-xs font-normal">New task</DialogTitle>
            </span>
            <DialogDescription className="sr-only">
              Give the task a title, then set its status, labels and due date.
            </DialogDescription>
          </div>

          <form.Field name="title">
            {(field) => (
              <input
                ref={titleRef}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="Task title"
                aria-label="Task title"
                aria-invalid={create.isError || undefined}
                className="w-full bg-transparent px-4 pt-4 pb-3 text-lg font-medium outline-none placeholder:text-muted-foreground/60"
              />
            )}
          </form.Field>

          <div className="flex flex-wrap items-center gap-1.5 px-4 pb-4">
            <form.Subscribe selector={(state) => state.values}>
              {({ statusId, labelIds, dueDate }) => {
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
                  </>
                );
              }}
            </form.Subscribe>
          </div>

          <div className="flex items-center gap-3 border-t border-border px-4 py-3">
            <div className="mr-auto">
              <FieldError message={create.isError && "Couldn't create the task, try again"} />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch id="create-more-tasks" checked={createMore} onCheckedChange={setCreateMore} />
              <label htmlFor="create-more-tasks" className="cursor-pointer">
                Create more
              </label>
            </div>
            <form.Subscribe selector={(state) => taskSchema.safeParse(state.values).success}>
              {(ready) => (
                <Button type="submit" size="sm" disabled={!ready && createStatus === "idle"}>
                  <StatusButtonContent
                    status={createStatus}
                    label="Create task"
                    successLabel="Created"
                    errorLabel="Try again"
                  />
                </Button>
              )}
            </form.Subscribe>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
