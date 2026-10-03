import { useForm } from "@tanstack/react-form";
import { AllDayTimeFields, DateField } from "../../sessions/calendar/date-time-form-fields";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, addMonths, addWeeks, format } from "date-fns";
import { useEffect, useRef } from "react";
import { z } from "zod";
import { FieldError, statusOf } from "#/components/action-feedback.tsx";
import { FormField, fieldMessage, hasVisibleErrors } from "#/components/form-field.tsx";
import { SpaceGlyph } from "#/components/spotlight.tsx";
import {
  createCalendarEntryTemplate,
  createOneOffCalendarEntry,
  generateCalendarEntryOccurrences,
} from "#/lib/api/calendarEntries.ts";
import { listSpaces } from "#/lib/api/spaces.ts";
import { Input } from "@nookly/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nookly/ui/components/select";
import { QuickCreateDialogShell } from "../../calendar/QuickCreateDialogShell";
import { type SlotRange, minutesToTime } from "../../sessions/calendar/calendar-model";
import { qk } from "#/lib/query-keys.ts";

const recurrenceSchema = z.enum(["none", "daily", "weekly", "monthly"]);

type Recurrence = z.infer<typeof recurrenceSchema>;

const entrySchema = z
  .object({
    title: z.string().trim().min(1, "Give the entry a title"),
    targetSpaceId: z.string().min(1, "Pick a Space"),
    date: z.string().min(1, "Pick a date"),
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

  return (
    <QuickCreateDialogShell
      open={draft !== null}
      onOpenChange={onOpenChange}
      create={create}
      title="New calendar entry"
      submitLabel="Create calendar entry"
      successLabel="Entry created"
      onSubmit={() => void form.handleSubmit()}
      renderSubmitBlocked={(render) => (
        <form.Subscribe selector={hasVisibleErrors}>{render}</form.Subscribe>
      )}
      formClassName="grid grid-cols-2 gap-3"
    >
      {spaceId === undefined && (
        <form.Field name="targetSpaceId">
          {(field) => (
            <FormField label="Space" required error={fieldMessage(field)} className="col-span-2">
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
            </FormField>
          )}
        </form.Field>
      )}
      <form.Field name="title">
        {(field) => (
          <FormField
            label="Title"
            required
            htmlFor="calendar-entry-create-title"
            error={fieldMessage(field)}
            className="col-span-2"
          >
            <Input
              id="calendar-entry-create-title"
              ref={titleRef}
              placeholder="e.g. Dentist"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </FormField>
        )}
      </form.Field>
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
      <AllDayTimeFields form={form} idPrefix="calendar-entry-create" />
      <form.Subscribe selector={(state) => Boolean(state.values.endDate)}>
        {(spansDays) => (
          <>
            <form.Field name="location">
              {(field) => (
                <FormField
                  label="Location"
                  htmlFor="calendar-entry-create-location"
                  className={spansDays ? "col-span-2" : undefined}
                >
                  <Input
                    id="calendar-entry-create-location"
                    placeholder="Optional"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </FormField>
              )}
            </form.Field>
            {!spansDays && (
              <form.Field name="recurrence">
                {(field) => (
                  <FormField label="Repeat">
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
                  </FormField>
                )}
              </form.Field>
            )}
          </>
        )}
      </form.Subscribe>
      <div className="col-span-2 empty:hidden">
        <FieldError message={create.isError && create.error.message} />
      </div>
    </QuickCreateDialogShell>
  );
}
