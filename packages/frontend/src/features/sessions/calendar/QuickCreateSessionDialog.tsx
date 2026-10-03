import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addDays, addMonths, addWeeks, addYears, format, parse } from "date-fns";
import { useEffect, useRef } from "react";
import { z } from "zod";
import {
  FieldError,
  StatusButtonContent,
  statusOf,
  useCloseAfterSuccess,
} from "#/components/action-feedback.tsx";
import { DateInput } from "#/components/date-input.tsx";
import { EntityPickerPopover } from "#/components/entity-picker.tsx";
import { Button } from "@nookly/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import { TimeInput } from "#/components/time-input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nookly/ui/components/select";
import { NumberInput } from "@nookly/ui/components/number-input";
import { Input } from "@nookly/ui/components/input";
import { Label } from "@nookly/ui/components/label";
import {
  createOneOffSession,
  createSessionTemplate,
  generateOccurrences,
} from "#/lib/api/sessions.ts";
import type { Entity } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { type SlotRange, minutesToTime } from "./calendar-model";
import { qk } from "#/lib/query-keys.ts";

const CADENCES = {
  none: "Does not repeat",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};
const DURATION_UNITS = {
  days: addDays,
  weeks: addWeeks,
  months: addMonths,
  years: addYears,
};
const MAX_OCCURRENCES = 366;

/// Every date the session lands on, from `start` up to but not including `start` plus the duration.
function repeatDates(
  start: Date,
  v: Pick<SessionValues, "cadence" | "durationCount" | "durationUnit">,
) {
  if (v.cadence === "none") return [start];
  const end = DURATION_UNITS[v.durationUnit](start, v.durationCount);
  const step = { daily: addDays, weekly: addWeeks, monthly: addMonths }[v.cadence];
  const dates: Date[] = [];
  for (let i = 0; dates.length <= MAX_OCCURRENCES; i++) {
    const next = step(start, i);
    if (next >= end) break;
    dates.push(next);
  }
  return dates;
}

const cadenceSchema = z.enum(["none", "daily", "weekly", "monthly"]);
const durationUnitSchema = z.enum(["days", "weeks", "months", "years"]);

const sessionSchema = z
  .object({
    title: z.string().trim().min(1),
    course: z.custom<Entity | null>().refine((c): boolean => c !== null, "Pick a course"),
    date: z.string().min(1),
    startTime: z.string().min(1),
    endTime: z.string().min(1),
    location: z.string(),
    cadence: cadenceSchema,
    durationCount: z.number().int().min(1).max(999),
    durationUnit: durationUnitSchema,
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
  cadence: "none",
  durationCount: 16,
  durationUnit: "weeks",
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
      durationCount,
      durationUnit,
    }: SessionValues) => {
      if (!draft || !course) throw new Error("Pick a course first");
      const day = parse(date, "yyyy-MM-dd", new Date());
      const place = location.trim() || null;
      const dates = repeatDates(day, { cadence, durationCount, durationUnit });
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
      await queryClient.invalidateQueries({ queryKey: qk.sessions.bySpace(spaceId) });
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
          <DialogTitle>New session</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
          className="flex flex-col gap-3"
        >
          <form.Field name="title">
            {(field) => (
              <Input
                ref={titleRef}
                placeholder="Title, e.g. Algorithms I"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            )}
          </form.Field>
          <form.Field name="course">
            {(field) => (
              <EntityPickerPopover
                spaceId={spaceId}
                typeFilter="course"
                trigger={
                  <Button type="button" variant="secondary" size="sm" className="justify-start">
                    {field.state.value ? displayTitle(field.state.value) : "Pick course…"}
                  </Button>
                }
                onSelect={field.handleChange}
              />
            )}
          </form.Field>
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
          <form.Subscribe selector={(state) => state.fieldMeta.endTime?.errors[0]}>
            {(endError) => (
              <FieldError message={endError?.message || (create.isError && create.error.message)} />
            )}
          </form.Subscribe>
          <div className="flex items-center gap-2">
            <Label className="font-normal">Repeat</Label>
            <form.Field name="cadence">
              {(field) => (
                <Select
                  value={field.state.value}
                  onValueChange={(v) => {
                    const parsed = cadenceSchema.safeParse(v);
                    if (parsed.success) field.handleChange(parsed.data);
                  }}
                >
                  <SelectTrigger size="sm" aria-label="Repeat interval">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CADENCES).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </form.Field>
            <form.Subscribe selector={(state) => state.values.cadence !== "none"}>
              {(repeats) =>
                repeats && (
                  <>
                    <Label className="font-normal">for</Label>
                    <form.Field name="durationCount">
                      {(field) => (
                        <NumberInput
                          value={field.state.value}
                          onChange={field.handleChange}
                          min={1}
                          max={999}
                        />
                      )}
                    </form.Field>
                    <form.Field name="durationUnit">
                      {(field) => (
                        <Select
                          value={field.state.value}
                          onValueChange={(v) => {
                            const parsed = durationUnitSchema.safeParse(v);
                            if (parsed.success) field.handleChange(parsed.data);
                          }}
                        >
                          <SelectTrigger size="sm" aria-label="Duration unit">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.keys(DURATION_UNITS).map((unit) => (
                              <SelectItem key={unit} value={unit}>
                                {unit}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </form.Field>
                  </>
                )
              }
            </form.Subscribe>
          </div>
          {/* Lets Enter submit from any field. */}
          <button type="submit" hidden aria-label="Create session" />
        </form>
        <DialogFooter>
          <form.Subscribe selector={(state) => sessionSchema.safeParse(state.values).success}>
            {(ready) => (
              <Button disabled={!ready} onClick={() => void form.handleSubmit()}>
                <StatusButtonContent
                  status={createStatus}
                  label="Create"
                  successLabel="Session created"
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
