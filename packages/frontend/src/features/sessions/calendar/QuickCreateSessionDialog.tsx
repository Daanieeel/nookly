import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addWeeks, format } from "date-fns";
import { useEffect, useRef } from "react";
import { z } from "zod";
import {
  FieldError,
  StatusButtonContent,
  statusOf,
  useCloseAfterSuccess,
} from "#/components/action-feedback.tsx";
import { EntityPickerPopover } from "#/components/entity-picker.tsx";
import { Button } from "@nookly/ui/components/button";
import { Checkbox } from "@nookly/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import { Input } from "@nookly/ui/components/input";
import { Label } from "@nookly/ui/components/label";
import {
  createOneOffSession,
  createSessionTemplate,
  generateOccurrences,
} from "#/lib/api/sessions.ts";
import type { Entity } from "#/lib/api/types.ts";
import { formatShortDate, formatWeekday } from "#/lib/datetime.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { type SlotRange, minutesToTime } from "./calendar-model";

const sessionSchema = z
  .object({
    title: z.string().trim().min(1),
    course: z.custom<Entity | null>().refine((c): boolean => c !== null, "Pick a course"),
    startTime: z.string().min(1),
    endTime: z.string().min(1),
    location: z.string(),
    repeatWeekly: z.boolean(),
  })
  .refine((v) => !v.startTime || !v.endTime || v.startTime < v.endTime, {
    path: ["endTime"],
    message: "End after it starts",
  });

type SessionValues = z.infer<typeof sessionSchema>;

const emptyValues: SessionValues = {
  title: "",
  course: null,
  startTime: "09:00",
  endTime: "10:00",
  location: "",
  repeatWeekly: false,
};

/// Opens on the range picked on the calendar: the title and Course come first,
/// the times arrive filled in and only need touching to fine tune them.
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
      startTime: minutesToTime(draft.startMin),
      endTime: minutesToTime(draft.endMin),
    });
    setTimeout(() => titleRef.current?.focus(), 0);
  }, [draft, form]);

  const create = useMutation({
    mutationFn: async ({
      title,
      course,
      startTime,
      endTime,
      location,
      repeatWeekly,
    }: SessionValues) => {
      if (!draft || !course) throw new Error("Pick a course first");
      const date = format(draft.date, "yyyy-MM-dd");
      const place = location.trim() || null;
      if (repeatWeekly) {
        const template = await createSessionTemplate(
          spaceId,
          title.trim(),
          course.id,
          draft.date.getDay() === 0 ? 6 : draft.date.getDay() - 1,
          startTime,
          endTime,
          place,
          date,
        );
        const occurrences = await generateOccurrences(
          template.id,
          format(addWeeks(draft.date, 16), "yyyy-MM-dd"),
        );
        return occurrences.map((o) => o.entity.id);
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
      await queryClient.invalidateQueries({ queryKey: ["sessions", spaceId] });
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
          {draft && (
            <p className="text-sm text-muted-foreground">
              {formatWeekday(draft.date)}, {formatShortDate(draft.date)}
            </p>
          )}
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
          <div className="flex items-center gap-1.5">
            <form.Field name="startTime">
              {(field) => (
                <Input
                  type="time"
                  aria-label="Start time"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className="flex-1"
                />
              )}
            </form.Field>
            <span className="text-xs text-muted-foreground">to</span>
            <form.Field name="endTime">
              {(field) => (
                <Input
                  type="time"
                  aria-label="End time"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
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
          <form.Field name="repeatWeekly">
            {(field) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="session-repeat-weekly"
                  checked={field.state.value}
                  onCheckedChange={(v) => field.handleChange(v === true)}
                />
                <Label htmlFor="session-repeat-weekly" className="font-normal">
                  Repeat weekly (16 weeks)
                </Label>
              </div>
            )}
          </form.Field>
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
