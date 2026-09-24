import { IconCalendarX, IconClockEdit, IconPlus, IconRestore } from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  FieldError,
  StatusButtonContent,
  statusOf,
  useCloseAfterSuccess,
} from "@/components/action-feedback";
import { registerActions, registerEntityType } from "@/components/context-menu/registry";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { listSessions, overrideOccurrence } from "@/lib/api/sessions";
import type { Entity, SessionOccurrence } from "@/lib/api/types";
import { formatClock } from "@/lib/datetime";
import { minutesToTime } from "./calendar/calendar-model";

declare module "@/components/context-menu/registry" {
  interface ContextTargets {
    /// One empty half hour of the calendar's time grid, `startMin` minutes after midnight.
    "sessions.slot": { startMin: number; startCreate: () => void };
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
function RescheduleForm({
  occurrence,
  close,
  refresh,
}: {
  occurrence: SessionOccurrence;
  close: () => void;
  refresh: () => Promise<void>;
}) {
  const [date, setDate] = useState(occurrence.date);
  const [startTime, setStartTime] = useState(occurrence.startTime);
  const [endTime, setEndTime] = useState(occurrence.endTime);
  const valid = Boolean(date && startTime && endTime) && startTime < endTime;
  const move = useMutation({
    mutationFn: async () => {
      await overrideOccurrence(occurrence.entity.id, { date, startTime, endTime });
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
        if (valid && !move.isPending) move.mutate();
      }}
    >
      <DateInput
        aria-label="Date"
        clearable={false}
        value={date || null}
        onChange={(day) => setDate(day ?? "")}
      />
      <div className="flex items-center gap-1.5">
        <Input
          type="time"
          aria-label="Start time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          className="h-8 flex-1"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <Input
          type="time"
          aria-label="End time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          className="h-8 flex-1"
        />
      </div>
      <FieldError message={!valid && startTime >= endTime && "End after it starts"} />
      <Button type="submit" size="sm" disabled={!valid}>
        <StatusButtonContent
          status={status}
          label="Move Occurrence"
          errorLabel="Couldn't move, try again"
        />
      </Button>
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

registerActions("sessions.slot", [
  {
    id: "new-session",
    group: "create",
    label: ({ startMin }) => `New Session at ${formatClock(minutesToTime(startMin))}`,
    icon: IconPlus,
    afterClose: true,
    run: ({ startCreate }) => startCreate(),
  },
]);
