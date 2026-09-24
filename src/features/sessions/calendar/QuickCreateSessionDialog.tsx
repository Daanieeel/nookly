import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addWeeks, format } from "date-fns";
import { useEffect, useRef, useState } from "react";
import {
  FieldError,
  StatusButtonContent,
  statusOf,
  useCloseAfterSuccess,
} from "@/components/action-feedback";
import { EntityPickerPopover } from "@/components/entity-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createOneOffSession,
  createSessionTemplate,
  generateOccurrences,
} from "@/lib/api/sessions";
import type { Entity } from "@/lib/api/types";
import { formatShortDate, formatWeekday } from "@/lib/datetime";
import { displayTitle } from "@/lib/entity-title";
import { type SlotRange, minutesToTime } from "./calendar-model";

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
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState<Entity | null>(null);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!draft) return;
    setTitle("");
    setCourse(null);
    setStartTime(minutesToTime(draft.startMin));
    setEndTime(minutesToTime(draft.endMin));
    setRepeatWeekly(false);
    setTimeout(() => titleRef.current?.focus(), 0);
  }, [draft]);

  const timesValid = Boolean(startTime && endTime) && startTime < endTime;
  const ready = title.trim() !== "" && course !== null && timesValid;

  const create = useMutation({
    mutationFn: async () => {
      if (!draft || !course) throw new Error("Pick a course first");
      const date = format(draft.date, "yyyy-MM-dd");
      if (repeatWeekly) {
        const template = await createSessionTemplate(
          spaceId,
          title.trim(),
          course.id,
          draft.date.getDay() === 0 ? 6 : draft.date.getDay() - 1,
          startTime,
          endTime,
          null,
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
        null,
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
            if (ready && !create.isPending) create.mutate();
          }}
          className="flex flex-col gap-3"
        >
          <Input
            ref={titleRef}
            placeholder="Title, e.g. Algorithms I"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <EntityPickerPopover
            spaceId={spaceId}
            typeFilter="course"
            trigger={
              <Button type="button" variant="secondary" size="sm" className="justify-start">
                {course ? displayTitle(course) : "Pick course…"}
              </Button>
            }
            onSelect={setCourse}
          />
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
          <FieldError
            message={
              (!timesValid && startTime >= endTime && "End after it starts") ||
              (create.isError && create.error.message)
            }
          />
          <div className="flex items-center gap-2">
            <Checkbox
              id="session-repeat-weekly"
              checked={repeatWeekly}
              onCheckedChange={(v) => setRepeatWeekly(v === true)}
            />
            <Label htmlFor="session-repeat-weekly" className="font-normal">
              Repeat weekly (16 weeks)
            </Label>
          </div>
          {/* Lets Enter submit from any field. */}
          <button type="submit" hidden aria-label="Create session" />
        </form>
        <DialogFooter>
          <Button
            disabled={!ready}
            onClick={() => !create.isPending && createStatus !== "success" && create.mutate()}
          >
            <StatusButtonContent
              status={createStatus}
              label="Create"
              successLabel="Session created"
              errorLabel="Couldn't create, try again"
            />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
