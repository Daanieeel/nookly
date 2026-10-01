import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, addMonths, addWeeks, format } from "date-fns";
import { useEffect, useRef } from "react";
import { z } from "zod";
import {
  FieldError,
  StatusButtonContent,
  statusOf,
  useCloseAfterSuccess,
} from "#/components/action-feedback.tsx";
import { DateInput } from "#/components/date-input.tsx";
import { SpaceGlyph } from "#/components/spotlight.tsx";
import {
  createCalendarEntryTemplate,
  createOneOffCalendarEntry,
  generateCalendarEntryOccurrences,
} from "#/lib/api/calendarEntries.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import { Button } from "@nookly/ui/components/button";
import { Checkbox } from "@nookly/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import { TimeInput } from "#/components/time-input.tsx";
import { Input } from "@nookly/ui/components/input";
import { Label } from "@nookly/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nookly/ui/components/select";
import { type SlotRange, minutesToTime } from "../../sessions/calendar/calendar-model";
import { qk } from "#/lib/query-keys.ts";

const recurrenceSchema = z.enum(["none", "daily", "weekly", "monthly"]);

type Recurrence = z.infer<typeof recurrenceSchema>;

const entrySchema = z
  .object({
    title: z.string().trim().min(1),
    targetSpaceId: z.string().min(1),
    date: z.string().min(1),
    endDate: z.string(),
    allDay: z.boolean(),
    startTime: z.string(),
    endTime: z.string(),
    location: z.string(),
    recurrence: recurrenceSchema,
  })
  .refine((v) => v.allDay || (Boolean(v.startTime && v.endTime) && v.startTime < v.endTime), {
    path: ["endTime"],
    message: "End after it starts",
  })
  .refine((v) => !v.endDate || v.endDate >= v.date, {
    path: ["endDate"],
    message: "Can't end before it starts",
  });

type EntryValues = z.infer<typeof entrySchema>;

const emptyValues: EntryValues = {
  title: "",
  targetSpaceId: "",
  date: "",
  endDate: "",
  allDay: false,
  startTime: "09:00",
  endTime: "10:00",
  location: "",
  recurrence: "none",
};

const RECURRENCE_OPTIONS = [
  { value: "none", label: "Doesn't repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] satisfies { value: Recurrence; label: string }[];

/// The message for the time or span problem shown under the fields, if any.
function entryError(values: EntryValues): string | undefined {
  const issues = entrySchema.safeParse(values).error?.issues ?? [];
  const timesIssue = issues.find((i) => i.path[0] === "endTime");
  if (timesIssue && values.startTime >= values.endTime) return timesIssue.message;
  return issues.find((i) => i.path[0] === "endDate")?.message;
}

/// How far ahead occurrences are generated up front for each cadence, so a
/// recurring calendar entry shows a useful run on the calendar right away.
function horizonFor(recurrence: Recurrence, anchor: Date): Date {
  if (recurrence === "daily") return addDays(anchor, 60);
  if (recurrence === "monthly") return addMonths(anchor, 12);
  return addWeeks(anchor, 16);
}

/// Opens on the range picked on the calendar, the same creation surface as
/// `QuickCreateSessionDialog` — no Course picker (calendar entries have no
/// required parent), and a recurrence cadence instead of a single "repeat
/// weekly" checkbox. `spaceId` is fixed on a per-Space calendar; omitted (the
/// unified cross-Space Calendar page has no single "current" Space), the
/// dialog adds its own required Space picker instead.
export function QuickCreateCalendarEntryDialog({
  spaceId,
  draft,
  onOpenChange,
  onCreated,
}: {
  spaceId?: string;
  draft: SlotRange | null;
  onOpenChange: (open: boolean) => void;
  /// The new occurrences' entity ids, to highlight them on the calendar.
  onCreated: (entityIds: string[]) => void;
}) {
  const queryClient = useQueryClient();
  const { data: spaces = [] } = useQuery({
    queryKey: qk.spaces,
    queryFn: listSpaces,
    enabled: spaceId === undefined,
  });
  const titleRef = useRef<HTMLInputElement>(null);

  const form = useForm({
    defaultValues: { ...emptyValues, targetSpaceId: spaceId ?? "" },
    validators: { onChange: entrySchema },
    onSubmit: ({ value }) => {
      if (!create.isPending && createStatus !== "success") create.mutate(value);
    },
  });

  useEffect(() => {
    if (!draft) return;
    form.reset({
      title: "",
      targetSpaceId: spaceId ?? "",
      date: format(draft.date, "yyyy-MM-dd"),
      endDate: draft.endDate ? format(draft.endDate, "yyyy-MM-dd") : "",
      allDay: false,
      startTime: minutesToTime(draft.startMin),
      endTime: minutesToTime(draft.endMin),
      location: "",
      recurrence: "none",
    });
    setTimeout(() => titleRef.current?.focus(), 0);
  }, [draft, spaceId, form]);

  const create = useMutation({
    mutationFn: async ({
      title,
      targetSpaceId,
      date,
      endDate,
      allDay,
      startTime,
      endTime,
      location,
      recurrence,
    }: EntryValues) => {
      if (!draft || !date) throw new Error("Pick a date first");
      if (!targetSpaceId) throw new Error("Pick a Space first");
      const nextLocation = location.trim() || null;
      if (recurrence !== "none") {
        const template = await createCalendarEntryTemplate(
          targetSpaceId,
          title.trim(),
          recurrence,
          allDay ? null : startTime,
          allDay ? null : endTime,
          allDay,
          nextLocation,
          null,
          date,
        );
        const occurrences = await generateCalendarEntryOccurrences(
          template.id,
          format(horizonFor(recurrence, draft.date), "yyyy-MM-dd"),
        );
        return occurrences.map((o) => o.entity.id);
      }
      const occurrence = await createOneOffCalendarEntry(
        targetSpaceId,
        title.trim(),
        date,
        allDay ? null : startTime,
        allDay ? null : endTime,
        allDay,
        nextLocation,
        null,
        endDate || null,
      );
      return [occurrence.entity.id];
    },
    onSuccess: async (ids) => {
      await queryClient.invalidateQueries({
        queryKey: qk.calendarEntries.root,
      });
      onCreated(ids);
    },
  });
  const createStatus = statusOf(create);
  useCloseAfterSuccess(create, () => {
    onOpenChange(false);
    create.reset();
  });

  return (
    <Dialog
      open={draft !== null}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) create.reset();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New calendar entry</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="flex flex-col gap-3"
        >
          {spaceId === undefined && (
            <form.Field name="targetSpaceId">
              {(field) => (
                <Select value={field.state.value} onValueChange={field.handleChange}>
                  <SelectTrigger className="w-full" aria-label="Space">
                    <SelectValue placeholder="Pick a Space…" />
                  </SelectTrigger>
                  <SelectContent>
                    {spaces.map((space) => (
                      <SelectItem key={space.id} value={space.id}>
                        <span className="flex items-center gap-2">
                          <SpaceGlyph space={space} size={14} />
                          {space.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </form.Field>
          )}
          <form.Field name="title">
            {(field) => (
              <Input
                ref={titleRef}
                placeholder="Title, e.g. Dentist"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            )}
          </form.Field>
          <div className="flex items-center gap-1.5">
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
            <span className="text-xs text-muted-foreground">to</span>
            <form.Field name="endDate">
              {(field) => (
                <DateInput
                  aria-label="End date"
                  placeholder="Same day"
                  value={field.state.value || null}
                  onChange={(day) => field.handleChange(day ?? "")}
                />
              )}
            </form.Field>
          </div>
          <form.Field name="allDay">
            {(field) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="calendar-entry-create-all-day"
                  checked={field.state.value}
                  onCheckedChange={(v) => field.handleChange(v === true)}
                />
                <Label htmlFor="calendar-entry-create-all-day" className="font-normal">
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
                placeholder="Location (optional)"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            )}
          </form.Field>
          <form.Subscribe selector={(state) => Boolean(state.values.endDate)}>
            {(spansDays) =>
              !spansDays && (
                <form.Field name="recurrence">
                  {(field) => (
                    <Select
                      value={field.state.value}
                      // SAFETY: Radix only emits the `RECURRENCE_OPTIONS` values below.
                      onValueChange={(v) => field.handleChange(v as Recurrence)}
                    >
                      <SelectTrigger className="w-full" aria-label="Repeat">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RECURRENCE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </form.Field>
              )
            }
          </form.Subscribe>
          <form.Subscribe selector={(state) => entryError(state.values)}>
            {(error) => <FieldError message={error || (create.isError && create.error.message)} />}
          </form.Subscribe>
          {/* Lets Enter submit from any field. */}
          <button type="submit" hidden aria-label="Create calendar entry" />
        </form>
        <DialogFooter>
          <form.Subscribe selector={(state) => entrySchema.safeParse(state.values).success}>
            {(ready) => (
              <Button disabled={!ready} onClick={() => void form.handleSubmit()}>
                <StatusButtonContent
                  status={createStatus}
                  label="Create"
                  successLabel="Entry created"
                  errorLabel="Couldn't create, try again"
                />
              </Button>
            )}
          </form.Subscribe>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
