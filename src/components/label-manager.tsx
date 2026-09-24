import { IconAlertTriangle, IconPlus, IconTag, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type CSSProperties, useEffect, useState } from "react";
import {
  FieldError,
  StatusButtonContent,
  StatusIcon,
  statusOf,
  useActionStatus,
  useCloseAfterSuccess,
} from "@/components/action-feedback";
import { EntityMention } from "@/components/entity-mention";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { createLabel, deleteLabel, listLabels, updateLabel } from "@/lib/api/labels";
import type { Label } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/// Muted, evenly spread hues so a new label reads apart from its neighbours.
export const LABEL_COLORS = [
  "#e5484d",
  "#f76b15",
  "#ffc53d",
  "#46a758",
  "#12a594",
  "#0090ff",
  "#6e56cf",
  "#d6409f",
];

/// A stable color per name, so the same word always gets the same hue.
export function labelColorFor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return LABEL_COLORS[hash % LABEL_COLORS.length];
}

/// Every view that shows labels or their usage refreshes after a change.
function useRefreshLabels(spaceId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [["labels", spaceId], ["entity-labels"], ["tasks", spaceId], ["task"]].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
}

/// Creates a label in the Space with a color picked from its name. Callers that
/// create it from a picker attach it themselves with the returned label.
export function useCreateLabel(spaceId: string) {
  const refresh = useRefreshLabels(spaceId);
  return useMutation({
    mutationFn: (name: string) => createLabel(spaceId, name, labelColorFor(name)),
    onSuccess: () => refresh(),
  });
}

/// A name field that creates a label on Enter, for surfaces without a picker of
/// their own (the context menu's Labels submenu).
export function NewLabelForm({
  spaceId,
  onCreated,
}: {
  spaceId: string;
  onCreated: (label: Label) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: async (value: string) => {
      const label = await createLabel(spaceId, value, labelColorFor(value));
      await onCreated(label);
    },
  });
  const trimmed = name.trim();
  return (
    <form
      className="flex w-60 flex-col gap-1 p-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (trimmed && !create.isPending) create.mutate(trimmed);
      }}
    >
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3 flex -translate-y-1/2">
          <StatusIcon
            status={statusOf(create)}
            idle={<Swatch color={trimmed ? labelColorFor(trimmed) : "var(--muted-foreground)"} />}
            size={12}
          />
        </span>
        <Input
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (create.isError) create.reset();
          }}
          placeholder="New label, press Enter"
          aria-label="New label name"
          className="pl-8"
        />
      </div>
      <FieldError message={create.isError && "Couldn't create label."} />
    </form>
  );
}

function Swatch({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={cn("size-2.5 shrink-0 rounded-full bg-(--label-color)", className)}
      // SAFETY: `--label-color` only ever receives a plain hex string from the labels
      // API or `LABEL_COLORS`; `CSSProperties` just doesn't model custom properties.
      style={{ "--label-color": color } as CSSProperties}
    />
  );
}

/// Every label of a Space: rename in place, recolor from the dot, delete, and
/// add new ones. Opened from the Space's menu in the sidebar.
export function LabelsDialog({
  spaceId,
  spaceName,
  open,
  onOpenChange,
}: {
  spaceId: string;
  spaceName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: labels = [] } = useQuery({
    queryKey: ["labels", spaceId],
    queryFn: () => listLabels(spaceId),
    enabled: open,
  });
  const [draft, setDraft] = useState("");
  const create = useCreateLabel(spaceId);
  const name = draft.trim();
  const exists = labels.some((l) => l.name.toLowerCase() === name.toLowerCase());

  useEffect(() => {
    if (!open) {
      setDraft("");
      create.reset();
    }
    // `create.reset` is stable; only the dialog closing should clear the draft.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = () => {
    if (!name || exists || create.isPending) return;
    create.mutate(name, { onSuccess: () => setDraft("") });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-3">
        <DialogHeader>
          <DialogTitle>Labels</DialogTitle>
          <DialogDescription>Shared by everything in {spaceName}.</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Swatch
                color={name ? labelColorFor(name) : "var(--muted-foreground)"}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
              />
              <Input
                autoFocus
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (create.isError) create.reset();
                }}
                placeholder="New label"
                aria-label="New label name"
                className="pl-8"
              />
            </div>
            <Button type="submit" variant="secondary" disabled={!name || exists}>
              <StatusButtonContent
                status={statusOf(create)}
                icon={<IconPlus />}
                label="Add"
                errorLabel="Retry"
              />
            </Button>
          </div>
          <FieldError
            message={
              exists ? "A label with this name exists." : create.isError && "Couldn't add label."
            }
          />
        </form>

        {labels.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 rounded-md border border-dashed border-border py-8 text-center">
            <IconTag size={16} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No labels in this Space yet.</p>
          </div>
        ) : (
          <ul className="-mx-2 flex max-h-80 flex-col overflow-y-auto">
            {labels.map((label) => (
              <LabelRow key={label.id} label={label} labels={labels} />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function LabelRow({ label, labels }: { label: Label; labels: Label[] }) {
  const refresh = useRefreshLabels(label.spaceId);
  const [name, setName] = useState(label.name);
  const [confirmOpen, setConfirmOpen] = useState(false);
  useEffect(() => setName(label.name), [label.name]);

  const update = useMutation({
    mutationFn: (patch: { name?: string; color?: string }) => updateLabel(label.id, patch),
    onSuccess: () => refresh(),
  });
  const status = useActionStatus(update);
  const del = useMutation({
    mutationFn: () => deleteLabel(label.id),
    onSuccess: () => refresh(),
  });
  useCloseAfterSuccess(del, () => setConfirmOpen(false));

  const trimmed = name.trim();
  const taken = labels.some(
    (l) => l.id !== label.id && l.name.toLowerCase() === trimmed.toLowerCase(),
  );
  const commit = () => {
    if (!trimmed || taken) return setName(label.name);
    if (trimmed !== label.name) update.mutate({ name: trimmed });
  };

  return (
    <li className="group/row flex h-9 items-center gap-1 rounded-md px-2 hover:bg-accent/50">
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`Change color of ${label.name}`}
                className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-accent"
              >
                <Swatch color={label.color} />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Change Color</TooltipContent>
        </Tooltip>
        <PopoverContent align="start" className="flex w-auto gap-1.5 p-2">
          {LABEL_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Color ${color}`}
              aria-pressed={label.color === color}
              onClick={() => update.mutate({ color })}
              className={cn(
                "flex size-6 cursor-pointer items-center justify-center rounded-full hover:bg-accent",
                label.color === color && "ring-2 ring-ring",
              )}
            >
              <Swatch color={color} className="size-3.5" />
            </button>
          ))}
        </PopoverContent>
      </Popover>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape" && name !== label.name) {
            e.stopPropagation();
            setName(label.name);
          }
        }}
        aria-label={`Rename ${label.name}`}
        aria-invalid={taken || undefined}
        className={cn(
          "h-7 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-sm outline-none hover:border-input focus-visible:border-input focus-visible:bg-accent",
          (taken || status === "error") && "border-destructive/60",
        )}
      />
      <span className="flex w-5 shrink-0 justify-center">
        <StatusIcon status={status} idle={null} size={14} />
      </span>
      <span className="w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
        {label.usageCount === 0
          ? "Unused"
          : `${label.usageCount} ${label.usageCount === 1 ? "item" : "items"}`}
      </span>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`Delete ${label.name}`}
            onClick={() => setConfirmOpen(true)}
            className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover/row:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100"
          >
            <IconTrash size={14} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Delete Label</TooltipContent>
      </Tooltip>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open && !del.isSuccess) del.reset();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex flex-wrap items-center gap-1.5">
              <IconAlertTriangle className="size-4 shrink-0 text-destructive" />
              Delete
              <EntityMention icon={<Swatch color={label.color} />} label={label.name} />?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {label.usageCount === 0
                ? "No item carries this label."
                : `It comes off ${label.usageCount} ${label.usageCount === 1 ? "item" : "items"}; the items themselves stay.`}{" "}
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                if (!del.isPending) del.mutate();
              }}
            >
              <StatusButtonContent
                status={statusOf(del)}
                label="Delete Label"
                errorLabel="Couldn't delete, try again"
              />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
