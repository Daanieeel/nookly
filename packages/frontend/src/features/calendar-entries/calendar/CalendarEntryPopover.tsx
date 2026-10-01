import {
  IconCalendarX,
  IconClock,
  IconMapPin,
  IconPencil,
  IconRepeat,
  IconRestore,
  IconTrash,
} from "@tabler/icons-react";
import { useForm } from "@tanstack/react-form";
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
  FieldError,
  StatusAnnouncer,
  StatusButtonContent,
  StatusIcon,
  statusOf,
  useActionStatus,
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
import { Badge } from "@nookly/ui/components/badge";
import { Button } from "@nookly/ui/components/button";
import { Checkbox } from "@nookly/ui/components/checkbox";
import { DateInput } from "#/components/date-input.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@nookly/ui/components/dropdown-menu";
import { TimeInput } from "#/components/time-input.tsx";
import { Input } from "@nookly/ui/components/input";
import { Label } from "@nookly/ui/components/label";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { Tabs, TabsList, TabsTrigger } from "@nookly/ui/components/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nookly/ui/components/tooltip";
import {
  type CalendarEntrySeriesPatch,
  deleteCalendarEntrySeries,
  listCalendarEntries,
  overrideCalendarEntryOccurrence,
  updateCalendarEntrySeries,
} from "#/lib/api/calendarEntries.ts";
import { restoreEntity, softDeleteEntity, updateEntity } from "#/lib/api/entities.ts";
import type { CalendarEntry } from "#/lib/api/types.ts";
import { formatClock, formatShortDate, formatWeekday } from "#/lib/datetime.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { qk } from "#/lib/query-keys.ts";

/// Which occurrences an edit reaches, mirroring `SessionPopover`'s `EditScope`.
type EditScope = "this" | "following" | "upcoming";

const SCOPES = [
  { id: "this", label: "This one" },
  { id: "following", label: "This and following" },
  { id: "upcoming", label: "All upcoming" },
] satisfies { id: EditScope; label: string }[];

const entryEditSchema = z
  .object({
    title: z.string().trim().min(1),
    date: z.string().min(1),
    endDate: z.string(),
    allDay: z.boolean(),
    startTime: z.string(),
    endTime: z.string(),
    location: z.string(),
  })
  .refine((v) => v.allDay || (v.startTime !== "" && v.endTime !== "" && v.startTime < v.endTime), {
    path: ["endTime"],
    message: "End after it starts",
  })
  .refine((v) => !v.endDate || v.endDate >= v.date, {
    path: ["endDate"],
    message: "Can't end before it starts",
  });

type EntryEditValues = z.infer<typeof entryEditSchema>;

function refreshEntries(queryClient: QueryClient, entityId: string) {
  return Promise.all([
    // The root key (not a per Space key) so this also invalidates the
    // cross-Space qk.calendarEntries.all cache the unified Calendar page reads.
    queryClient.invalidateQueries({ queryKey: qk.calendarEntries.root }),
    queryClient.invalidateQueries({ queryKey: qk.entity.byId(entityId) }),
  ]);
}

/// Clicking a calendar entry on any calendar (its own Space's, or the unified
/// cross-Space Calendar page) opens this instead of leaving the page: its
/// details, edits for this occurrence or its series. Mirrors `SessionPopover`,
/// minus the Jot/Note linking, which is a Session-specific pattern.
export function CalendarEntryPopover({
  spaceId,
  entry,
  children,
}: {
  spaceId: string;
  entry: CalendarEntry;
  children: ReactNode;
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
          {editing ? (
            <CalendarEntryEditForm entry={entry} onDone={() => setEditing(false)} />
          ) : (
            <CalendarEntrySummary
              entry={entry}
              onEdit={() => setEditing(true)}
              onDeleteSeries={() => {
                setOpen(false);
                setSeriesDeleteOpen(true);
              }}
              close={() => setOpen(false)}
            />
          )}
        </PopoverContent>
      </Popover>
      {entry.templateId && (
        <DeleteSeriesDialog
          spaceId={spaceId}
          entry={entry}
          templateId={entry.templateId}
          open={seriesDeleteOpen}
          onOpenChange={setSeriesDeleteOpen}
        />
      )}
    </>
  );
}

function CalendarEntrySummary({
  entry,
  onEdit,
  onDeleteSeries,
  close,
}: {
  entry: CalendarEntry;
  onEdit: () => void;
  onDeleteSeries: () => void;
  close: () => void;
}) {
  const queryClient = useQueryClient();
  const { entity } = entry;
  const toggleCancelled = useMutation({
    mutationFn: async () => {
      await overrideCalendarEntryOccurrence(entity.id, { cancelled: !entry.cancelled });
      await refreshEntries(queryClient, entity.id);
    },
  });
  const toggleStatus = useActionStatus(toggleCancelled);
  const toggleLabel =
    toggleStatus === "error"
      ? "Couldn't save, try again"
      : entry.cancelled
        ? "Restore entry"
        : "Cancel entry";
  const trash = useMutation({
    mutationFn: () => softDeleteEntity(entity.id),
    onSuccess: async () => {
      close();
      await refreshEntries(queryClient, entity.id);
      toast.success("Entry moved to Trash", {
        action: {
          label: "Undo",
          onClick: () =>
            void restoreEntity(entity.id).then(() => refreshEntries(queryClient, entity.id)),
        },
      });
    },
  });

  return (
    <div className="flex flex-col gap-2.5 p-3">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold wrap-break-word">{displayTitle(entity)}</span>
        </div>
        {entry.cancelled && <Badge variant="secondary">Cancelled</Badge>}
        <div className="-mt-1 -mr-1 flex shrink-0 items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="iconSm"
                aria-label={toggleLabel}
                onClick={() => !toggleCancelled.isPending && toggleCancelled.mutate()}
              >
                <StatusIcon
                  status={toggleStatus}
                  idle={entry.cancelled ? <IconRestore /> : <IconCalendarX />}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{toggleLabel}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="iconSm" aria-label="Edit entry" onClick={onEdit}>
                <IconPencil />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit entry</TooltipContent>
          </Tooltip>
          {entry.templateId ? (
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="iconSm" aria-label="Delete entry">
                      <StatusIcon status={statusOf(trash)} idle={<IconTrash />} />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Delete entry</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => trash.mutate()}>
                  Delete this entry
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onDeleteSeries}>
                  Delete this and following…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label="Delete entry"
                  onClick={() => !trash.isPending && trash.mutate()}
                >
                  <StatusIcon status={statusOf(trash)} idle={<IconTrash />} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete entry</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 text-muted-foreground">
        <span className="flex items-start gap-2">
          <IconClock size={14} className="mt-0.5 shrink-0" />
          {formatWeekday(entry.date)}, {formatShortDate(entry.date)}
          {entry.endDate &&
            entry.endDate !== entry.date &&
            ` to ${formatWeekday(entry.endDate)}, ${formatShortDate(entry.endDate)}`}
          {!entry.allDay &&
            `, ${formatClock(entry.startTime ?? "00:00")} to ${formatClock(entry.endTime ?? "00:00")}`}
          {entry.allDay && ", all day"}
        </span>
        {entry.location && (
          <span className="flex items-start gap-2">
            <IconMapPin size={14} className="mt-0.5 shrink-0" />
            <span className="wrap-break-word">{entry.location}</span>
          </span>
        )}
        {entry.templateId && (
          <span className="flex items-center gap-2">
            <IconRepeat size={14} className="shrink-0" />
            Repeats
          </span>
        )}
        {entry.description && <span className="wrap-break-word">{entry.description}</span>}
      </div>

      <StatusAnnouncer message={trash.isError ? "Couldn't move the entry to Trash" : null} />
    </div>
  );
}

function CalendarEntryEditForm({ entry, onDone }: { entry: CalendarEntry; onDone: () => void }) {
  const queryClient = useQueryClient();
  const { entity, templateId } = entry;
  const [scope, setScope] = useState<EditScope>("this");

  const form = useForm({
    defaultValues: {
      title: entity.title,
      date: entry.date,
      endDate: entry.endDate ?? "",
      allDay: entry.allDay,
      startTime: entry.startTime ?? "09:00",
      endTime: entry.endTime ?? "10:00",
      location: entry.location ?? "",
    } satisfies EntryEditValues,
    validators: { onChange: entryEditSchema },
    onSubmit: ({ value }) => {
      if (!save.isPending) save.mutate(value);
    },
  });

  const save = useMutation({
    mutationFn: async ({
      title,
      date,
      endDate,
      allDay,
      startTime,
      endTime,
      location,
    }: EntryEditValues) => {
      const nextLocation = location.trim() || null;
      if (scope === "this" || !templateId) {
        if (title.trim() !== entity.title) await updateEntity(entity.id, { title: title.trim() });
        await overrideCalendarEntryOccurrence(entity.id, {
          date,
          endDate: endDate || null,
          startTime: allDay ? null : startTime,
          endTime: allDay ? null : endTime,
          allDay,
          location: nextLocation,
        });
      } else {
        const patch: CalendarEntrySeriesPatch = {};
        if (title.trim() !== entity.title) patch.title = title.trim();
        if (allDay !== entry.allDay) patch.allDay = allDay;
        if (startTime !== entry.startTime) patch.startTime = allDay ? null : startTime;
        if (endTime !== entry.endTime) patch.endTime = allDay ? null : endTime;
        if (nextLocation !== entry.location) patch.location = nextLocation;
        const from = scope === "following" ? entry.date : format(new Date(), "yyyy-MM-dd");
        await updateCalendarEntrySeries(templateId, from, patch);
      }
      await refreshEntries(queryClient, entity.id);
    },
  });
  useCloseAfterSuccess(save, onDone);

  return (
    <form
      className="flex flex-col gap-2 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      {templateId && (
        // SAFETY: Radix only emits the `SCOPES` trigger values below.
        <Tabs value={scope} onValueChange={(next) => setScope(next as EditScope)}>
          <TabsList size="sm" className="w-full">
            {SCOPES.map((s) => (
              <TabsTrigger key={s.id} value={s.id} size="sm">
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      <form.Field name="title">
        {(field) => (
          <Input
            aria-label="Title"
            placeholder="Title"
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(e) => field.handleChange(e.target.value)}
          />
        )}
      </form.Field>
      {scope === "this" && (
        <>
          <form.Field name="date">
            {(field) => (
              <DateInput
                aria-label="Date"
                clearable={false}
                value={field.state.value || null}
                onChange={(day) => field.handleChange(day ?? "")}
              />
            )}
          </form.Field>
          <form.Field name="endDate">
            {(field) => (
              <DateInput
                aria-label="End date"
                placeholder="Ends same day"
                value={field.state.value || null}
                onChange={(day) => field.handleChange(day ?? "")}
              />
            )}
          </form.Field>
        </>
      )}
      <form.Field name="allDay">
        {(field) => (
          <div className="flex items-center gap-2">
            <Checkbox
              id="calendar-entry-all-day"
              checked={field.state.value}
              onCheckedChange={(v) => field.handleChange(v === true)}
            />
            <Label htmlFor="calendar-entry-all-day" className="font-normal">
              All day
            </Label>
          </div>
        )}
      </form.Field>
      <form.Subscribe selector={(state) => state.values.allDay}>
        {(allDay) =>
          !allDay && (
            <div className="flex items-center gap-1.5">
              <form.Field name="startTime">
                {(field) => (
                  <TimeInput
                    aria-label="Start time"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={field.handleChange}
                    className="flex-1"
                  />
                )}
              </form.Field>
              <span className="text-xs text-muted-foreground">to</span>
              <form.Field name="endTime">
                {(field) => (
                  <TimeInput
                    aria-label="End time"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={field.handleChange}
                    className="flex-1"
                  />
                )}
              </form.Field>
            </div>
          )
        }
      </form.Subscribe>
      <form.Field name="location">
        {(field) => (
          <Input
            aria-label="Location"
            placeholder="Location"
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(e) => field.handleChange(e.target.value)}
          />
        )}
      </form.Field>
      {scope !== "this" && (
        <p className="text-xs text-muted-foreground">
          {scope === "following"
            ? "Changes this entry and every later one in the series."
            : "Changes every entry from today on."}{" "}
          Past entries and changes made to single ones stay as they are.
        </p>
      )}
      <form.Subscribe
        selector={(state) =>
          state.fieldMeta.endTime?.errors[0] ?? state.fieldMeta.endDate?.errors[0]
        }
      >
        {(fieldError) => (
          <FieldError message={fieldError?.message || (save.isError && save.error.message)} />
        )}
      </form.Subscribe>
      <div className="flex justify-end gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <form.Subscribe selector={(state) => entryEditSchema.safeParse(state.values).success}>
          {(ready) => (
            <Button type="submit" size="sm" disabled={!ready}>
              <StatusButtonContent
                status={statusOf(save)}
                label="Save"
                errorLabel="Couldn't save, try again"
              />
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}

function DeleteSeriesDialog({
  spaceId,
  entry,
  templateId,
  open,
  onOpenChange,
}: {
  spaceId: string;
  entry: CalendarEntry;
  templateId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: entries = [] } = useQuery({
    queryKey: qk.calendarEntries.bySpace(spaceId),
    queryFn: () => listCalendarEntries(spaceId),
    enabled: open,
  });
  const count = entries.filter((a) => a.templateId === templateId && a.date >= entry.date).length;
  const remove = useMutation({
    mutationFn: () => deleteCalendarEntrySeries(templateId, entry.date),
    onSuccess: () => refreshEntries(queryClient, entry.entity.id),
  });
  useCloseAfterSuccess(remove, () => {
    onOpenChange(false);
    remove.reset();
  });
  const status = statusOf(remove);
  const noun = count === 1 ? "entry" : "entries";

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
              icon={<EntityIcon entity={entry.entity} size={13} />}
              label={displayTitle(entry.entity)}
            />
            to Trash?
          </AlertDialogTitle>
          <AlertDialogDescription>
            The entry on {formatShortDate(entry.date)} and every later one in the series go to
            Trash. Earlier ones stay. Restore them from Trash any time.
          </AlertDialogDescription>
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
