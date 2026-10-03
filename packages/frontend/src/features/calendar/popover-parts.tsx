import { useMutation } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  type ActionStatus,
  StatusButtonContent,
  statusOf,
  useCloseAfterSuccess,
} from "#/components/action-feedback.tsx";
import { EntityIcon } from "#/components/entity-icon.tsx";
import { EntityMention } from "#/components/entity-mention.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@nookly/ui/components/alert-dialog";
import { Button } from "@nookly/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { Tabs, TabsList, TabsTrigger } from "@nookly/ui/components/tabs";
import type { Entity } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";

/// Which occurrences an edit reaches, as in any calendar. A series edit never
/// rewrites past occurrences or fields an occurrence changed on its own.
export type EditScope = "this" | "following" | "upcoming";

/// The scope switcher at the top of a series occurrence's edit form.
export function EditScopeTabs({
  value,
  onChange,
  thisLabel,
  className,
}: {
  value: EditScope;
  onChange: (scope: EditScope) => void;
  thisLabel: string;
  className?: string;
}) {
  const scopes = [
    { id: "this", label: thisLabel },
    { id: "following", label: "This and following" },
    { id: "upcoming", label: "All upcoming" },
  ] satisfies { id: EditScope; label: string }[];
  return (
    // SAFETY: Radix only emits the `scopes` trigger values below.
    <Tabs value={value} onValueChange={(next) => onChange(next as EditScope)} className={className}>
      <TabsList size="sm" className="w-full">
        {scopes.map((s) => (
          <TabsTrigger key={s.id} value={s.id} size="sm">
            {s.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

/// The Cancel and Save buttons closing an edit form.
export function EditFormActions({
  blocked,
  status,
  onDone,
  className,
}: {
  blocked: boolean;
  status: ActionStatus;
  onDone: () => void;
  className?: string;
}) {
  return (
    <div className={className ?? "flex justify-end gap-1"}>
      <Button type="button" variant="ghost" size="sm" onClick={onDone}>
        Cancel
      </Button>
      <Button type="submit" size="sm" disabled={blocked}>
        <StatusButtonContent status={status} label="Save" errorLabel="Couldn't save, try again" />
      </Button>
    </div>
  );
}

/// The popover a calendar block opens: owns the open, edit and series delete
/// state, and shows the series delete dialog once the body asks for it.
export function CalendarItemPopover({
  children,
  body,
  seriesDialog,
}: {
  /// The calendar block or month line that opens it.
  children: ReactNode;
  body: (ctrl: {
    editing: boolean;
    setEditing: (editing: boolean) => void;
    close: () => void;
    openSeriesDelete: () => void;
  }) => ReactNode;
  /// Null for a one off item, which has no series to delete.
  seriesDialog: ((p: { open: boolean; onOpenChange: (open: boolean) => void }) => ReactNode) | null;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [seriesDeleteOpen, setSeriesDeleteOpen] = useState(false);

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setEditing(false);
        }}
      >
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent align="start" className="flex w-80 flex-col text-sm">
          {body({
            editing,
            setEditing,
            close: () => setOpen(false),
            openSeriesDelete: () => {
              setOpen(false);
              setSeriesDeleteOpen(true);
            },
          })}
        </PopoverContent>
      </Popover>
      {seriesDialog?.({ open: seriesDeleteOpen, onOpenChange: setSeriesDeleteOpen })}
    </>
  );
}

/// Confirms moving an occurrence and every later one in its series to Trash.
export function SeriesTrashDialog({
  entity,
  count,
  nouns,
  description,
  open,
  onOpenChange,
  deleteSeries,
  onDeleted,
}: {
  entity: Entity;
  /// How many occurrences the delete reaches.
  count: number;
  nouns: { one: string; many: string };
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deleteSeries: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const remove = useMutation({ mutationFn: deleteSeries, onSuccess: onDeleted });
  useCloseAfterSuccess(remove, () => {
    onOpenChange(false);
    remove.reset();
  });
  const status = statusOf(remove);
  const noun = count === 1 ? nouns.one : nouns.many;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) remove.reset();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex flex-wrap items-center gap-1.5">
            Move {count} {noun} of
            <EntityMention
              icon={<EntityIcon entity={entity} size={13} />}
              label={displayTitle(entity)}
            />
            to Trash?
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={(e) => {
              e.preventDefault();
              if (status === "idle" || status === "error") remove.mutate();
            }}
          >
            <StatusButtonContent
              status={status}
              label={`Move ${count} to Trash`}
              errorLabel="Couldn't move to Trash, try again"
            />
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
