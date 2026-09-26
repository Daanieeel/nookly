import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addDays, addMonths, addWeeks, format } from "date-fns";
import { useEffect, useRef, useState } from "react";
import {
  FieldError,
  StatusButtonContent,
  statusOf,
  useCloseAfterSuccess,
} from "#/components/action-feedback.tsx";
import {
  createCalendarEntryTemplate,
  createOneOffCalendarEntry,
  generateCalendarEntryOccurrences,
} from "#/lib/api/calendarEntries.ts";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nookly/ui/components/select";
import { formatShortDate, formatWeekday } from "#/lib/datetime.ts";
import { type SlotRange, minutesToTime } from "../../sessions/calendar/calendar-model";

type Recurrence = "none" | "daily" | "weekly" | "monthly";

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
/// weekly" checkbox.
export function QuickCreateCalendarEntryDialog({
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
  const [title, setTitle] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [location, setLocation] = useState("");
  const [recurrence, setRecurrence] = useState<Recurrence>("none");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!draft) return;
    setTitle("");
    setAllDay(false);
    setStartTime(minutesToTime(draft.startMin));
    setEndTime(minutesToTime(draft.endMin));
    setLocation("");
    setRecurrence("none");
    setTimeout(() => titleRef.current?.focus(), 0);
  }, [draft]);

  const timesValid = allDay || (Boolean(startTime && endTime) && startTime < endTime);
  const ready = title.trim() !== "" && timesValid;

  const create = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("Pick a time first");
      const date = format(draft.date, "yyyy-MM-dd");
      const nextLocation = location.trim() || null;
      if (recurrence !== "none") {
        const template = await createCalendarEntryTemplate(
          spaceId,
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
        spaceId,
        title.trim(),
        date,
        allDay ? null : startTime,
        allDay ? null : endTime,
        allDay,
        nextLocation,
        null,
      );
      return [occurrence.entity.id];
    },
    onSuccess: async (ids) => {
      await queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] === "calendar-entries",
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
          {draft && (
            <p className="text-sm text-muted-foreground">
              {formatWeekday(draft.date)}, {formatShortDate(draft.date)}
            </p>
          )}
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (ready && !create.isPending) create.mutate();
          }}
          className="flex flex-col gap-3"
        >
          <Input
            ref={titleRef}
            placeholder="Title, e.g. Dentist"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Checkbox
              id="calendar-entry-create-all-day"
              checked={allDay}
              onCheckedChange={(v) => setAllDay(v === true)}
            />
            <Label htmlFor="calendar-entry-create-all-day" className="font-normal">
              All day
            </Label>
          </div>
          {!allDay && (
            <div className="flex items-center gap-1.5">
              <Input
                type="time"
                aria-label="Start time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="time"
                aria-label="End time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="flex-1"
              />
            </div>
          )}
          <Input
            placeholder="Location (optional)"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <Select
            value={recurrence}
            // SAFETY: Radix only emits the `RECURRENCE_OPTIONS` values below.
            onValueChange={(v) => setRecurrence(v as Recurrence)}
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
          <FieldError
            message={
              (!timesValid && startTime >= endTime && "End after it starts") ||
              (create.isError && create.error.message)
            }
          />
          {/* Lets Enter submit from any field. */}
          <button type="submit" hidden aria-label="Create calendar entry" />
        </form>
        <DialogFooter>
          <Button
            disabled={!ready}
            onClick={() => !create.isPending && createStatus !== "success" && create.mutate()}
          >
            <StatusButtonContent
              status={createStatus}
              label="Create"
              successLabel="Entry created"
              errorLabel="Couldn't create, try again"
            />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
