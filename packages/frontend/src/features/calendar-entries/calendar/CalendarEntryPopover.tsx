import {
  IconCalendarX,
  IconClock,
  IconMapPin,
  IconPencil,
  IconRepeat,
  IconRestore,
  IconTrash,
} from "@tabler/icons-react";
import { AllDayTimeFields, DateField } from "../../sessions/calendar/date-time-form-fields";
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
  StatusIcon,
  statusOf,
  useActionStatus,
  useCloseAfterSuccess,
} from "#/components/action-feedback.tsx";
import { FormField, fieldMessage, hasVisibleErrors } from "#/components/form-field.tsx";
import { Badge } from "@nookly/ui/components/badge";
import { Button } from "@nookly/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@nookly/ui/components/dropdown-menu";
import { Input } from "@nookly/ui/components/input";
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
import {
  CalendarItemPopover,
  EditFormActions,
  EditScopeTabs,
  type EditScope,
  SeriesTrashDialog,
} from "../../calendar/popover-parts";

const entryEditSchema = z
  .object({
    title: z.string().trim().min(1, "Give the entry a title"),
    date: z.string().min(1, "Pick a date"),
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
  const { templateId } = entry;

  return (
    <CalendarItemPopover
      body={({ editing, setEditing, close, openSeriesDelete }) =>
        editing ? (
          <CalendarEntryEditForm entry={entry} onDone={() => setEditing(false)} />
        ) : (
          <CalendarEntrySummary
            entry={entry}
            onEdit={() => setEditing(true)}
            onDeleteSeries={openSeriesDelete}
            close={close}
          />
        )
      }
      seriesDialog={
        templateId
          ? ({ open, onOpenChange }) => (
              <DeleteSeriesDialog
                spaceId={spaceId}
                entry={entry}
                templateId={templateId}
                open={open}
                onOpenChange={onOpenChange}
              />
            )
          : null
      }
    >
      {children}
    </CalendarItemPopover>
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
        // The opened entry anchors the edit: it takes the change even where
        // it was edited on its own before (when it is not before `from`).
        await updateCalendarEntrySeries(templateId, from, patch, entity.id);
      }
      await refreshEntries(queryClient, entity.id);
    },
  });
  useCloseAfterSuccess(save, onDone);

  return (
    <form
      className="grid grid-cols-2 gap-2.5 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      {templateId && <EditScopeTabs value={scope} onChange={setScope} className="col-span-2" />}
      <form.Field name="title">
        {(field) => (
          <FormField
            label="Title"
            required
            htmlFor="calendar-entry-edit-title"
            error={fieldMessage(field)}
            className="col-span-2"
          >
            <Input
              id="calendar-entry-edit-title"
              placeholder="Title"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </FormField>
        )}
      </form.Field>
      {scope === "this" && (
        <>
          <form.Field name="date">
            {(field) => <DateField field={field} label="Starts" ariaLabel="Date" />}
          </form.Field>
          <form.Field name="endDate">
            {(field) => (
              <DateField
                field={field}
                label="Ends"
                ariaLabel="End date"
                optional
                placeholder="Same day"
              />
            )}
          </form.Field>
        </>
      )}
      <AllDayTimeFields form={form} idPrefix="calendar-entry-edit" />
      <form.Field name="location">
        {(field) => (
          <FormField label="Location" htmlFor="calendar-entry-edit-location" className="col-span-2">
            <Input
              id="calendar-entry-edit-location"
              placeholder="Optional"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </FormField>
        )}
      </form.Field>
      {scope !== "this" && (
        <p className="col-span-2 text-xs text-muted-foreground">
          {scope === "following"
            ? "Changes this entry and every later one in the series. Earlier ones, and fields changed on single later ones, stay as they are."
            : entry.date >= format(new Date(), "yyyy-MM-dd")
              ? "Changes this entry and every one from today on. Earlier ones, and fields changed on single later ones, stay as they are."
              : "Changes every entry from today on. This one is earlier and stays as it is, and so do fields changed on single later ones."}
        </p>
      )}
      <div className="col-span-2 empty:hidden">
        <FieldError message={save.isError && save.error.message} />
      </div>
      <form.Subscribe selector={hasVisibleErrors}>
        {(blocked) => (
          <EditFormActions
            blocked={blocked}
            status={statusOf(save)}
            onDone={onDone}
            className="col-span-2 flex justify-end gap-1"
          />
        )}
      </form.Subscribe>
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

  return (
    <SeriesTrashDialog
      entity={entry.entity}
      count={count}
      nouns={{ one: "entry", many: "entries" }}
      description={`The entry on ${formatShortDate(entry.date)} and every later one in the series go to Trash. Earlier ones stay. Restore them from Trash any time.`}
      open={open}
      onOpenChange={onOpenChange}
      deleteSeries={async () => {
        await deleteCalendarEntrySeries(templateId, entry.date);
      }}
      onDeleted={async () => {
        await refreshEntries(queryClient, entry.entity.id);
      }}
    />
  );
}
