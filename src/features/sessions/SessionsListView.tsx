import { IconChevronLeft, IconChevronRight, IconX } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, addWeeks, format, isSameDay, isToday, startOfWeek } from "date-fns";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import {
  FieldError,
  StatusButtonContent,
  StatusIcon,
  StatusAnnouncer,
  statusOf,
  useCloseAfterSuccess,
} from "@/components/action-feedback";
import { EntityPickerPopover } from "@/components/entity-picker";
import { Badge } from "@/components/ui/badge";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getEntity } from "@/lib/api/entities";
import { listRelationships } from "@/lib/api/relationships";
import {
  createOneOffSession,
  createSessionTemplate,
  generateOccurrences,
  listSessions,
  overrideOccurrence,
} from "@/lib/api/sessions";
import type { Entity, SessionOccurrence } from "@/lib/api/types";
import { displayTitle } from "@/lib/entity-title";
import { useNavStore } from "@/lib/store/nav";

const START_HOUR = 8;
const END_HOUR = 22;
const HOUR_PX = 48;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function topPxFor(startTime: string): number {
  const px = ((timeToMinutes(startTime) - START_HOUR * 60) / 60) * HOUR_PX;
  return Math.max(0, Math.min(px, (END_HOUR - START_HOUR) * HOUR_PX));
}

function heightPxFor(startTime: string, endTime: string): number {
  const px = ((timeToMinutes(endTime) - timeToMinutes(startTime)) / 60) * HOUR_PX;
  return Math.max(18, px);
}

interface DraftSlot {
  date: Date;
  hour: number;
}

/// Sessions are inherently time-based, so a weekly calendar grid is the primary
/// view (§2.3) — the calendar itself is also the creation surface (§3.3): clicking
/// an empty slot opens a quick-create popover pre-filled with that day and hour.
/// See `ExamsListView`'s equivalent doc comment for the `filterCourseId` convention.
export function SessionsListView({
  spaceId,
  filterCourseId,
}: {
  spaceId: string;
  filterCourseId?: string;
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [draft, setDraft] = useState<DraftSlot | null>(null);
  const openEntity = useNavStore((s) => s.openEntity);
  const setView = useNavStore((s) => s.setView);

  const { data: allSessions = [] } = useQuery({
    queryKey: ["sessions", spaceId],
    queryFn: () => listSessions(spaceId),
  });
  const { data: filterCourse } = useQuery({
    queryKey: ["entity", filterCourseId],
    // SAFETY: the query only runs when `enabled`, i.e. once `filterCourseId` is set.
    queryFn: () => getEntity(filterCourseId as string),
    enabled: Boolean(filterCourseId),
  });
  const { data: courseRelationships = [] } = useQuery({
    queryKey: ["relationships", filterCourseId],
    // SAFETY: the query only runs when `enabled`, i.e. once `filterCourseId` is set.
    queryFn: () => listRelationships(filterCourseId as string, "to"),
    enabled: Boolean(filterCourseId),
  });

  const sessions = filterCourseId
    ? allSessions.filter((s) =>
        courseRelationships.some(
          (r) => r.relationshipType === "session-course" && r.fromEntityId === s.entity.id,
        ),
      )
    : allSessions;

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Sessions</h1>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous week"
            onClick={() => setWeekStart((d) => addWeeks(d, -1))}
          >
            <IconChevronLeft size={15} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next week"
            onClick={() => setWeekStart((d) => addWeeks(d, 1))}
          >
            <IconChevronRight size={15} />
          </Button>
          <span className="pl-2 text-xs text-muted-foreground">
            {format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "MMM d, yyyy")}
          </span>
        </div>
      </div>

      {filterCourseId && filterCourse && (
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" className="gap-1 pr-1">
            Filtered by {displayTitle(filterCourse)}
            <button
              type="button"
              aria-label="Clear filter"
              onClick={() => setView({ kind: "module", spaceId, module: "sessions" })}
              className="rounded-full p-0.5 hover:bg-accent-foreground/10"
            >
              <IconX size={11} />
            </button>
          </Badge>
        </div>
      )}

      <div className="flex overflow-x-auto rounded-lg border border-border">
        <div className="flex min-w-[720px] flex-1">
          <div className="flex w-12 shrink-0 flex-col border-r border-border">
            <div className="h-10 shrink-0 border-b border-border" />
            {HOURS.map((h) => (
              <div
                key={h}
                className="h-12 shrink-0 border-b border-border px-1 pt-0.5 text-right text-xs text-muted-foreground last:border-b-0"
              >
                {h}:00
              </div>
            ))}
          </div>

          {days.map((day) => {
            const dayOccurrences = sessions.filter((s) => isSameDay(new Date(s.date), day));
            return (
              <div
                key={day.toISOString()}
                className="relative flex flex-1 flex-col border-r border-border last:border-r-0"
              >
                <div
                  className={`flex h-10 shrink-0 flex-col items-center justify-center border-b border-border text-xs ${
                    isToday(day)
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  <span>{format(day, "EEE")}</span>
                  <span>{format(day, "d")}</span>
                </div>
                <div className="relative">
                  {HOURS.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setDraft({ date: day, hour: h })}
                      aria-label={`New session at ${h}:00 on ${format(day, "EEEE")}`}
                      className="block h-12 w-full shrink-0 border-b border-border last:border-b-0 hover:bg-accent/60"
                    />
                  ))}
                  {dayOccurrences.map((occ) => (
                    <SessionBlock
                      key={occ.entity.id}
                      spaceId={spaceId}
                      occurrence={occ}
                      onOpen={() => openEntity(occ.entity.id, spaceId)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <QuickCreateSessionDialog
        spaceId={spaceId}
        draft={draft}
        onOpenChange={(open) => !open && setDraft(null)}
      />
    </div>
  );
}

function SessionBlock({
  spaceId,
  occurrence,
  onOpen,
}: {
  spaceId: string;
  occurrence: SessionOccurrence;
  onOpen: () => void;
}) {
  const queryClient = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => overrideOccurrence(occurrence.entity.id, { cancelled: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions", spaceId] }),
  });
  const cancelStatus = statusOf(cancel);
  const cancelLabel =
    cancelStatus === "error" ? "Couldn't cancel occurrence, try again" : "Cancel occurrence";
  const top = topPxFor(occurrence.startTime);
  const height = heightPxFor(occurrence.startTime, occurrence.endTime);
  return (
    <div
      className={`group absolute inset-x-1 top-(--occ-top) h-(--occ-height) overflow-hidden rounded-md border ${
        occurrence.cancelled
          ? "border-border bg-muted text-muted-foreground"
          : "border-primary/30 bg-primary/10 text-foreground"
      }`}
      // SAFETY: `--occ-top`/`--occ-height` only ever receive plain pixel-length
      // strings computed from this occurrence's own start/end time — a per-row
      // offset can't be a static Tailwind class, so it's threaded through a CSS
      // custom property instead of a direct inline `top`/`height` declaration.
      style={{ "--occ-top": `${top}px`, "--occ-height": `${height}px` } as CSSProperties}
    >
      <button
        type="button"
        onClick={onOpen}
        className={`size-full px-1.5 py-1 text-left text-xs ${
          occurrence.cancelled ? "line-through opacity-60" : "hover:bg-primary/15"
        }`}
      >
        <span className="block truncate font-medium">{displayTitle(occurrence.entity)}</span>
        <span className="block truncate text-xs opacity-80">
          {occurrence.startTime}–{occurrence.endTime}
        </span>
      </button>
      {!occurrence.cancelled && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={cancelLabel}
              onClick={() => !cancel.isPending && cancel.mutate()}
              className={`absolute top-0.5 right-0.5 rounded-sm p-0.5 hover:bg-accent group-hover:opacity-100 ${
                cancelStatus === "idle" ? "opacity-0" : "opacity-100"
              }`}
            >
              <StatusIcon status={cancelStatus} idle={<IconX size={11} />} size={11} />
            </button>
          </TooltipTrigger>
          <TooltipContent>{cancelLabel}</TooltipContent>
        </Tooltip>
      )}
      <StatusAnnouncer message={cancelStatus === "error" ? "Couldn't cancel occurrence" : null} />
    </div>
  );
}

function QuickCreateSessionDialog({
  spaceId,
  draft,
  onOpenChange,
}: {
  spaceId: string;
  draft: DraftSlot | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState<Entity | null>(null);
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (draft) {
      setTitle("");
      setCourse(null);
      setRepeatWeekly(false);
      setTimeout(() => titleRef.current?.focus(), 0);
    }
  }, [draft]);

  const create = useMutation({
    mutationFn: async () => {
      if (!draft || !course) throw new Error("Pick a course first");
      const date = format(draft.date, "yyyy-MM-dd");
      const startTime = `${String(draft.hour).padStart(2, "0")}:00`;
      const endTime = `${String(draft.hour + 1).padStart(2, "0")}:00`;
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
        await generateOccurrences(template.id, format(addWeeks(draft.date, 16), "yyyy-MM-dd"));
      } else {
        await createOneOffSession(spaceId, title.trim(), course.id, date, startTime, endTime, null);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions", spaceId] }),
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
          <DialogTitle>
            New session{draft ? ` — ${format(draft.date, "EEEE")} ${draft.hour}:00` : ""}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim() && course && !create.isPending) create.mutate();
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
              <Button type="button" variant="outline" size="sm" className="justify-start">
                {course ? displayTitle(course) : "Pick course…"}
              </Button>
            }
            onSelect={setCourse}
          />
          <FieldError message={create.isError && create.error.message} />
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
        </form>
        <DialogFooter>
          <Button
            disabled={!title.trim() || !course}
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
