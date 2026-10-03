import { useForm } from "@tanstack/react-form";
import { AllDayTimeFields, DateField } from "../../sessions/calendar/date-time-form-fields";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parse } from "date-fns";
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
import { RepeatChip, cadenceSchema, durationUnitSchema } from "#/components/repeat-chip.tsx";
import { DEFAULT_REPEAT, MAX_OCCURRENCES, repeatDates } from "#/lib/repeat.ts";
import { qk } from "#/lib/query-keys.ts";

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
    cadence: cadenceSchema,
    durationCount: z.number().int().min(1).max(999),
    durationUnit: durationUnitSchema,
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
  ...DEFAULT_REPEAT,
};

/// Opens on the range picked on the calendar, the same creation surface as
/// `QuickCreateSessionDialog` — no Course picker (calendar entries have no
/// required parent), and a repeat chip (cadence and duration) shared with the session dialog. `spaceId` is fixed on a per-Space calendar; omitted (the
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
      ...DEFAULT_REPEAT,
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
      cadence,
      durationCount,
      durationUnit,
    }: EntryValues) => {
      if (!draft || !date) throw new Error("Pick a date first");
      if (!targetSpaceId) throw new Error("Pick a Space first");
      const nextLocation = location.trim() || null;
      const repeats = endDate ? "none" : cadence;
      const dates = repeatDates(parse(date, "yyyy-MM-dd", new Date()), {
        cadence: repeats,
        durationCount,
        durationUnit,
      });
      if (dates.length > MAX_OCCURRENCES) {
        throw new Error(`Too many entries, ${MAX_OCCURRENCES} at most`);
      }
      if (repeats !== "none" && dates.length > 1) {
        const template = await createCalendarEntryTemplate(
          targetSpaceId,
          title.trim(),
          repeats,
          allDay ? null : startTime,
          allDay ? null : endTime,
          allDay,
          nextLocation,
          null,
          date,
        );
        const occurrences = await generateCalendarEntryOccurrences(
          template.id,
          format(dates[dates.length - 1], "yyyy-MM-dd"),
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
      <form.Field name="location">
        {(field) => (
          <FormField
            label="Location"
            htmlFor="calendar-entry-create-location"
            className="col-span-2"
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
      <form.Subscribe selector={(state) => state.values}>
        {(values) =>
          !values.endDate && (
            <FormField label="Repeat" className="col-span-2">
              <RepeatChip
                value={values}
                onChange={(repeat) => {
                  form.setFieldValue("cadence", repeat.cadence);
                  form.setFieldValue("durationCount", repeat.durationCount);
                  form.setFieldValue("durationUnit", repeat.durationUnit);
                }}
              />
            </FormField>
          )
        }
      </form.Subscribe>
      <div className="col-span-2 empty:hidden">
        <FieldError message={create.isError && create.error.message} />
      </div>
    </QuickCreateDialogShell>
  );
}
