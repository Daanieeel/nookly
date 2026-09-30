import { IconCalendarX, IconClockEdit, IconPlus, IconRestore } from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import {
  FieldError,
  StatusButtonContent,
  statusOf,
  useCloseAfterSuccess,
} from "#/components/action-feedback.tsx";
import { registerActions, registerEntityType } from "#/components/context-menu/registry.ts";
import { Button } from "@nookly/ui/components/button";
import { DateInput } from "#/components/date-input.tsx";
import { Input } from "@nookly/ui/components/input";
import { listSessions, overrideOccurrence } from "#/lib/api/sessions.ts";
import type { Entity, SessionOccurrence } from "#/lib/api/types.ts";
import { formatClock } from "#/lib/datetime.ts";
import { minutesToTime } from "./calendar/calendar-model";

declare module "#/components/context-menu/registry.ts" {
  interface ContextTargets {
    /// One empty half hour of a calendar's time grid (Sessions, the Calendar
    /// module, or the unified cross-Space Calendar page), `startMin` minutes
    /// after midnight. `noun` names what a right-click here creates.
    "calendar.slot": {
      startMin: number;
      noun: "Session" | "Calendar Entry";
      startCreate: () => void;
    };
  }
}

function useOccurrenceRecord(entity: Entity): SessionOccurrence | undefined {
  const { data: sessions } = useQuery({
    queryKey: ["sessions", entity.spaceId],
    queryFn: () => listSessions(entity.spaceId),
  });
  return sessions?.find((s) => s.entity.id === entity.id);
}

/// Moves one occurrence without touching the rest of its series, through the
/// same per occurrence override the calendar's cancel button writes.
const rescheduleSchema = z
  .object({
    date: z.string().min(1),
    startTime: z.string().min(1),
    endTime: z.string().min(1),
  })
  .refine((v) => v.startTime < v.endTime, { path: ["endTime"], message: "End after it starts" });

type RescheduleValues = z.infer<typeof rescheduleSchema>;

function RescheduleForm({
  occurrence,
  close,
  refresh,
}: {
  occurrence: SessionOccurrence;
  close: () => void;
  refresh: () => Promise<void>;
}) {
  const form = useForm({
    defaultValues: {
      date: occurrence.date,
      startTime: occurrence.startTime,
      endTime: occurrence.endTime,
    },
    validators: { onChange: rescheduleSchema },
    onSubmit: ({ value }) => {
      if (!move.isPending) move.mutate(value);
    },
  });
  const move = useMutation({
    mutationFn: async (values: RescheduleValues) => {
      await overrideOccurrence(occurrence.entity.id, values);
      await refresh();
    },
  });
  useCloseAfterSuccess(move, close);
  const status = statusOf(move);

  return (
    <form
      className="flex flex-col gap-2 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
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
            <Input
              type="time"
              aria-label="Start time"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              className="h-8 flex-1"
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
              className="h-8 flex-1"
            />
          )}
        </form.Field>
      </div>
      <form.Subscribe selector={(state) => state.fieldMeta.endTime?.errors[0]}>
        {(endError) => <FieldError message={endError?.message} />}
      </form.Subscribe>
      <form.Subscribe selector={(state) => rescheduleSchema.safeParse(state.values).success}>
        {(ready) => (
          <Button type="submit" size="sm" disabled={!ready}>
            <StatusButtonContent
              status={status}
              label="Move Occurrence"
              errorLabel="Couldn't move, try again"
            />
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}

registerEntityType<SessionOccurrence>({
  types: ["session"],
  // An occurrence belongs to its Course and its series; copies and moves across
  // Spaces happen at that level, not per occurrence.
  omit: ["duplicate", "move"],
  useRecord: useOccurrenceRecord,
  actions: [
    {
      id: "reschedule",
      group: "type",
      label: "Move to Another Time…",
      icon: IconClockEdit,
      when: ({ record }) => Boolean(record && !record.cancelled),
      run: ({ record }, helpers) => {
        if (!record) return;
        helpers.openPopover((close) => (
          <RescheduleForm occurrence={record} close={close} refresh={helpers.refresh} />
        ));
      },
    },
    {
      id: "toggle-cancelled",
      group: "type",
      label: ({ record }) => (record?.cancelled ? "Restore Occurrence" : "Cancel Occurrence"),
      icon: ({ record }: { record?: SessionOccurrence }) =>
        record?.cancelled ? IconRestore : IconCalendarX,
      disabled: ({ record }) => !record,
      run: async ({ entity, record }, helpers) => {
        if (!record) return;
        await overrideOccurrence(entity.id, { cancelled: !record.cancelled });
        await helpers.refresh();
      },
    },
  ],
});

// Shared by Sessions', the Calendar module's and the unified Calendar page's time
// grids — see the `"calendar.slot"` augmentation above.
registerActions("calendar.slot", [
  {
    id: "new-calendar-entry",
    group: "create",
    label: ({ startMin, noun }) => `New ${noun} at ${formatClock(minutesToTime(startMin))}`,
    icon: IconPlus,
    afterClose: true,
    run: ({ startCreate }) => startCreate(),
  },
]);
