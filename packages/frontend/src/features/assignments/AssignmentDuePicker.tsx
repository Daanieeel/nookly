import {
  IconCalendarEvent,
  IconCalendarTime,
  IconChevronLeft,
  IconSchool,
  IconX,
} from "@tabler/icons-react";
import { type ReactNode, useRef, useState } from "react";
import { DueDateChooser } from "#/features/tasks/task-properties.tsx";
import { Button } from "@nookly/ui/components/button";
import { NumberInput } from "@nookly/ui/components/number-input";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { cn } from "@nookly/ui/lib/utils";
import { useSpaceSessions } from "#/features/courses/course-queries.ts";
import { useCourseLookup } from "#/features/courses/course-lookup.tsx";
import { parseDay, toDay } from "#/features/tasks/task-model.ts";
import { dialogPopover } from "#/lib/dialog-popover.ts";
import { formatClock, formatDate } from "#/lib/datetime.ts";
import type { Assignment } from "#/lib/api/types.ts";
import {
  type AssignmentDue,
  type DueValue,
  MAX_DUE_OFFSET_DAYS,
  upcomingSessions,
} from "./assignment-model";

/// Common offsets, picked in one click; the stepper below covers the rest.
const SESSION_PRESETS = [
  { label: "Day of", days: 0 },
  { label: "1 day", days: 1 },
  { label: "2 days", days: 2 },
  { label: "1 week", days: 7 },
];

type Step = "choose" | "date" | "session" | "pick";

/// The picker for an assignment that already exists; its Course is found from it.
export function AssignmentDuePicker({
  assignment,
  ...rest
}: {
  assignment: Assignment;
  onSelect: (due: AssignmentDue) => void;
  align?: "start" | "end";
  children: ReactNode;
}) {
  return (
    <DuePicker
      value={assignment}
      spaceId={assignment.entity.spaceId}
      assignmentId={assignment.entity.id}
      {...rest}
    />
  );
}

/// Sets a due date in two steps: first what it is based on (a specific date, the
/// Course's next session, or one of its upcoming sessions), then the date itself or how
/// many days before the session. Works for a new due date and for changing or removing
/// one later. The Course is `courseId`, or that of the existing assignment `assignmentId`.
export function DuePicker({
  value,
  spaceId,
  courseId,
  assignmentId,
  onSelect,
  align = "start",
  children,
}: {
  value: DueValue;
  spaceId: string;
  courseId?: string | null;
  assignmentId?: string;
  onSelect: (due: AssignmentDue) => void;
  align?: "start" | "end";
  children: ReactNode;
}) {
  const assignment = value;
  const [open, setOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>("choose");
  const offset = assignment.dueSessionOffsetDays;
  const [days, setDays] = useState(offset ?? 0);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setStep("choose");
      setDays(offset ?? 0);
    }
  }

  function choose(due: AssignmentDue) {
    setOpen(false);
    onSelect(due);
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        {...dialogPopover(cn("p-2", step === "date" ? "w-120" : "w-80"))}
        align={align}
        aria-label="Due date"
        ref={contentRef}
        onOpenAutoFocus={(e) => {
          // Focus the popover itself: the first card would otherwise open with a focus ring
          // that reads as picked.
          e.preventDefault();
          contentRef.current?.focus();
        }}
      >
        {step === "choose" && (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-1.5">
              <ChoiceCard
                icon={<IconCalendarEvent />}
                title="Specific date"
                description="Pick a day on the calendar."
                selected={(assignment.dueDate !== null || offset !== null) && offset === null}
                onClick={() => setStep("date")}
              />
              <ChoiceCard
                icon={<IconSchool />}
                title="Before session"
                description="Follows the course's next session."
                selected={offset !== null && assignment.dueSessionId === null}
                onClick={() => setStep("session")}
              />
              <ChoiceCard
                icon={<IconCalendarTime />}
                title="Specific session"
                description="Follows one of the course's upcoming sessions."
                selected={assignment.dueSessionId !== null}
                className="col-span-2"
                onClick={() => setStep("pick")}
              />
            </div>
            {(assignment.dueDate || offset !== null) && (
              <Button
                variant="secondary"
                size="sm"
                className="w-full gap-2"
                onClick={() => choose({ kind: "date", day: null })}
              >
                <IconX />
                Clear due date
              </Button>
            )}
          </div>
        )}
        {step === "date" && (
          <div className="flex flex-col gap-1">
            <BackButton onClick={() => setStep("choose")} />
            <DueDateChooser
              value={offset === null ? assignment.dueDate : null}
              onSelect={(day) => choose({ kind: "date", day })}
            />
          </div>
        )}
        {step === "pick" && (
          <div className="flex flex-col gap-2">
            <BackButton onClick={() => setStep("choose")} />
            <SessionChoices
              spaceId={spaceId}
              courseId={courseId}
              assignmentId={assignmentId}
              initialSessionId={assignment.dueSessionId}
              initialDays={offset ?? 0}
              onPick={(sessionId, offsetDays) => choose({ kind: "session", offsetDays, sessionId })}
            />
          </div>
        )}
        {step === "session" && (
          <div className="flex flex-col gap-2">
            <BackButton onClick={() => setStep("choose")} />
            <OffsetChooser
              days={days}
              onDaysChange={setDays}
              onChoose={(offsetDays) => choose({ kind: "session", offsetDays })}
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/// How long before a session it is due: common spans in one click, a stepper for the
/// rest. Shared by "Before session" and "Specific session".
function OffsetChooser({
  days,
  onDaysChange,
  onChoose,
  disabled = false,
}: {
  days: number;
  onDaysChange: (days: number) => void;
  onChoose: (days: number) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <div className="grid grid-cols-4 gap-1">
        {SESSION_PRESETS.map((preset) => (
          <Button
            key={preset.days}
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => onChoose(preset.days)}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-border pt-2">
        <NumberInput value={days} onChange={onDaysChange} min={0} max={MAX_DUE_OFFSET_DAYS} />
        <span className="flex-1 text-xs text-muted-foreground">days before</span>
        <Button size="sm" disabled={disabled} onClick={() => onChoose(days)}>
          Set
        </Button>
      </div>
    </>
  );
}

/// The Course's upcoming sessions: pick one, then how long before it the assignment is
/// due. The assignment follows the picked session.
function SessionChoices({
  spaceId,
  courseId,
  assignmentId,
  initialSessionId,
  initialDays,
  onPick,
}: {
  spaceId: string;
  courseId?: string | null;
  assignmentId?: string;
  initialSessionId: string | null;
  initialDays: number;
  onPick: (sessionId: string, offsetDays: number) => void;
}) {
  const [days, setDays] = useState(initialDays);
  const [picked, setPicked] = useState<string | null>(initialSessionId);
  const { data: sessions = [], isPending } = useSpaceSessions(spaceId);
  const { courseOf: sessionCourse } = useCourseLookup(spaceId, "session-course");
  const { courseOf: assignmentCourse } = useCourseLookup(spaceId, "assignment-course");
  const course = courseId ?? (assignmentId ? assignmentCourse.get(assignmentId)?.id : undefined);
  const courseOfSession = new Map([...sessionCourse].map(([id, c]) => [id, c.id]));
  const upcoming = course
    ? upcomingSessions(sessions, course, courseOfSession, toDay(new Date()))
    : [];
  const selected = upcoming.some((s) => s.entity.id === picked) ? picked : null;

  return (
    <>
      {upcoming.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">
          {!course
            ? "Pick a course first."
            : isPending
              ? "Loading sessions…"
              : "This course has no upcoming sessions."}
        </p>
      ) : (
        <ul
          aria-label="Upcoming sessions"
          className="flex max-h-48 flex-col gap-0.5 overflow-y-auto"
        >
          {upcoming.map((session) => (
            <li key={session.entity.id}>
              <Button
                variant={session.entity.id === selected ? "secondary" : "ghost"}
                size="sm"
                className="w-full justify-between gap-2"
                aria-pressed={session.entity.id === selected}
                onClick={() => setPicked(session.entity.id)}
              >
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="shrink-0">{formatDate(parseDay(session.date))}</span>
                  <span className="truncate text-muted-foreground">{session.entity.title}</span>
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {formatClock(session.startTime)}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <OffsetChooser
        days={days}
        onDaysChange={setDays}
        disabled={selected === null}
        onChoose={(offsetDays) => selected && onPick(selected, offsetDays)}
      />
    </>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="self-start gap-1" onClick={onClick}>
      <IconChevronLeft />
      Back
    </Button>
  );
}

/// A select box in the shape of a card: an icon, what it is, and what it does.
function ChoiceCard({
  icon,
  title,
  description,
  selected,
  className,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  selected: boolean;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex cursor-pointer flex-col items-start gap-0.5 rounded-md border px-2 py-1.5 text-left transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
        selected ? "border-foreground/30 bg-accent" : "border-border",
        className,
      )}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium">
        {icon}
        {title}
      </span>
      <span className="text-xs/snug text-muted-foreground">{description}</span>
    </button>
  );
}
