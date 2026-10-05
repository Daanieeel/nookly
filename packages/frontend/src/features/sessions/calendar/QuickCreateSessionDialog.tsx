import { IconBook2, IconChevronDown } from "@tabler/icons-react";
import { DateField, TimeRangeFields } from "./date-time-form-fields";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parse } from "date-fns";
import { useEffect, useRef } from "react";
import { z } from "zod";
import { FieldError, statusOf } from "#/components/action-feedback.tsx";
import { FormField, fieldMessage, hasVisibleErrors } from "#/components/form-field.tsx";
import { EntityIcon } from "#/components/entity-icon.tsx";
import { EntityPickerPopover } from "#/components/entity-picker.tsx";
import { Button } from "@nookly/ui/components/button";
import { Input } from "@nookly/ui/components/input";
import {
  createOneOffSession,
  createSessionTemplate,
  generateOccurrences,
} from "#/lib/api/sessions.ts";
import type { Entity } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { QuickCreateDialogShell } from "../../calendar/QuickCreateDialogShell";
import { type SlotRange, minutesToTime } from "./calendar-model";
import {
  RepeatChip,
  cadenceSchema,
  durationUnitSchema,
  endModeSchema,
} from "#/components/repeat-chip.tsx";
import { DEFAULT_REPEAT, MAX_OCCURRENCES, repeatDates, repeatProblem } from "#/lib/repeat.ts";
import { cn } from "@nookly/ui/lib/utils";
import { qk } from "#/lib/query-keys.ts";

const sessionSchema = z
  .object({
    title: z.string().trim().min(1, "Give the session a title"),
    course: z.custom<Entity | null>().refine((c): boolean => c !== null, "Pick a course"),
    date: z.string().min(1, "Pick a date"),
    startTime: z.string().min(1, "Set a start time"),
    endTime: z.string().min(1, "Set an end time"),
    location: z.string(),
    cadence: cadenceSchema,
    endMode: endModeSchema,
    durationCount: z.number().int().min(1).max(999),
    durationUnit: durationUnitSchema,
    until: z.string(),
  })
  .refine((v) => !v.startTime || !v.endTime || v.startTime < v.endTime, {
    path: ["endTime"],
    message: "End after it starts",
  });

type SessionValues = z.infer<typeof sessionSchema>;

const emptyValues: SessionValues = {
  title: "",
  course: null,
  date: "",
  startTime: "09:00",
  endTime: "10:00",
  location: "",
  ...DEFAULT_REPEAT,
};

/// Opens on the range picked on the calendar: the title and Course come first,
/// the date and times arrive filled in and only need touching to fine tune them.
export function QuickCreateSessionDialog({
  spaceId,
  draft,
  onOpenChange,
  onCreated,
}: {
  spaceId: string;
  draft: SlotRange | null;
  onOpenChange: (open: boolean) => void;
  /// The new occurrences' entity ids, to highlight them on the calendar.
  onCreated: (entityIds: string[]) => void;
}) {
  const queryClient = useQueryClient();
  const titleRef = useRef<HTMLInputElement>(null);

  const form = useForm({
    defaultValues: emptyValues,
    validators: { onChange: sessionSchema },
    onSubmit: ({ value }) => {
      if (!create.isPending && createStatus !== "success") create.mutate(value);
    },
  });

  useEffect(() => {
    if (!draft) return;
    form.reset({
      ...emptyValues,
      date: format(draft.date, "yyyy-MM-dd"),
      startTime: minutesToTime(draft.startMin),
      endTime: minutesToTime(draft.endMin),
    });
    setTimeout(() => titleRef.current?.focus(), 0);
  }, [draft, form]);

  const create = useMutation({
    mutationFn: async ({
      title,
      course,
      date,
      startTime,
      endTime,
      location,
      cadence,
      endMode,
      durationCount,
      durationUnit,
      until,
    }: SessionValues) => {
      if (!draft || !course) throw new Error("Pick a course first");
      const day = parse(date, "yyyy-MM-dd", new Date());
      const place = location.trim() || null;
      const repeat = { cadence, endMode, durationCount, durationUnit, until };
      const problem = repeatProblem(date, repeat);
      if (problem) throw new Error(problem);
      const dates = repeatDates(day, repeat);
      if (dates.length > MAX_OCCURRENCES) {
        throw new Error(`Too many sessions, ${MAX_OCCURRENCES} at most`);
      }
      if (cadence === "weekly" && dates.length > 1) {
        const template = await createSessionTemplate(
          spaceId,
          title.trim(),
          course.id,
          day.getDay() === 0 ? 6 : day.getDay() - 1,
          startTime,
          endTime,
          place,
          date,
        );
        const occurrences = await generateOccurrences(
          template.id,
          format(dates[dates.length - 1], "yyyy-MM-dd"),
        );
        return occurrences.map((o) => o.entity.id);
      }
      if (dates.length > 1) {
        const ids: string[] = [];
        for (const d of dates) {
          const o = await createOneOffSession(
            spaceId,
            title.trim(),
            course.id,
            format(d, "yyyy-MM-dd"),
            startTime,
            endTime,
            place,
          );
          ids.push(o.entity.id);
        }
        return ids;
      }
      const occurrence = await createOneOffSession(
        spaceId,
        title.trim(),
        course.id,
        date,
        startTime,
        endTime,
        place,
      );
      return [occurrence.entity.id];
    },
    onSuccess: async (ids) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.sessions.bySpace(spaceId) }),
        // The Dashboard's and the sidebar's sessions of today and this week.
        queryClient.invalidateQueries({ queryKey: qk.sessions.today }),
      ]);
      onCreated(ids);
    },
  });
  const createStatus = statusOf(create);

  return (
    <QuickCreateDialogShell
      open={draft !== null}
      onOpenChange={onOpenChange}
      create={create}
      title="New session"
      submitLabel="Create session"
      successLabel="Session created"
      onSubmit={() => void form.handleSubmit()}
      renderSubmitBlocked={(render) => (
        <form.Subscribe selector={hasVisibleErrors}>{render}</form.Subscribe>
      )}
      formClassName="flex flex-col gap-3"
    >
      <form.Field name="title">
        {(field) => (
          <FormField label="Title" required htmlFor="session-title" error={fieldMessage(field)}>
            <Input
              id="session-title"
              ref={titleRef}
              placeholder="e.g. Algorithms I"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </FormField>
        )}
      </form.Field>
      <div className="grid grid-cols-2 gap-3">
        <form.Field name="course">
          {(field) => (
            <FormField label="Course" required error={fieldMessage(field)}>
              <EntityPickerPopover
                spaceId={spaceId}
                typeFilter="course"
                trigger={
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    data-field-control
                    className="h-8 justify-start px-3 font-normal"
                  >
                    {field.state.value ? (
                      <EntityIcon entity={field.state.value} size={16} />
                    ) : (
                      <IconBook2 className="text-muted-foreground" />
                    )}
                    <span className={cn("truncate", !field.state.value && "text-muted-foreground")}>
                      {field.state.value ? displayTitle(field.state.value) : "Pick course…"}
                    </span>
                    <IconChevronDown className="ml-auto text-muted-foreground" />
                  </Button>
                }
                onSelect={field.handleChange}
              />
            </FormField>
          )}
        </form.Field>
        <form.Field name="date">
          {(field) => <DateField field={field} label="Date" ariaLabel="Date" />}
        </form.Field>
        <TimeRangeFields form={form} />
      </div>
      <form.Field name="location">
        {(field) => (
          <FormField label="Location" htmlFor="session-location">
            <Input
              id="session-location"
              placeholder="Room..."
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </FormField>
        )}
      </form.Field>
      <FieldError message={create.isError && create.error.message} />
      <form.Subscribe selector={(state) => state.values}>
        {(values) => (
          <FormField label="Repeat">
            <RepeatChip
              value={values}
              onChange={(repeat) => {
                form.setFieldValue("cadence", repeat.cadence);
                form.setFieldValue("endMode", repeat.endMode);
                form.setFieldValue("durationCount", repeat.durationCount);
                form.setFieldValue("durationUnit", repeat.durationUnit);
                form.setFieldValue("until", repeat.until);
              }}
            />
          </FormField>
        )}
      </form.Subscribe>
    </QuickCreateDialogShell>
  );
}
