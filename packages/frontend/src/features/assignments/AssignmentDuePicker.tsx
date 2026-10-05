import { IconCalendarEvent, IconChevronLeft, IconSchool, IconX } from "@tabler/icons-react";
import { type ReactNode, useRef, useState } from "react";
import { DueDateChooser } from "#/features/tasks/task-properties.tsx";
import { Button } from "@nookly/ui/components/button";
import { NumberInput } from "@nookly/ui/components/number-input";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { cn } from "@nookly/ui/lib/utils";
import type { Assignment } from "#/lib/api/types.ts";
import { type AssignmentDue, MAX_DUE_OFFSET_DAYS } from "./assignment-model";

/// Common offsets, picked in one click; the stepper below covers the rest.
const SESSION_PRESETS = [
  { label: "Day of", days: 0 },
  { label: "1 day", days: 1 },
  { label: "2 days", days: 2 },
  { label: "1 week", days: 7 },
];

type Step = "choose" | "date" | "session";

/// Sets an assignment's due date in two steps: first what it is based on, a specific
/// date or the Course's next session, then the date itself or how many days before the
/// session. Works for a new due date and for changing or removing one later.
export function AssignmentDuePicker({
  assignment,
  onSelect,
  align = "start",
  children,
}: {
  assignment: Assignment;
  onSelect: (due: AssignmentDue) => void;
  align?: "start" | "end";
  children: ReactNode;
}) {
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
        className="w-80 p-2"
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
                selected={offset !== null}
                onClick={() => setStep("session")}
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
              searchable={false}
              value={offset === null ? assignment.dueDate : null}
              onSelect={(day) => choose({ kind: "date", day })}
            />
          </div>
        )}
        {step === "session" && (
          <div className="flex flex-col gap-2">
            <BackButton onClick={() => setStep("choose")} />
            <div className="grid grid-cols-4 gap-1">
              {SESSION_PRESETS.map((preset) => (
                <Button
                  key={preset.days}
                  variant="secondary"
                  size="sm"
                  onClick={() => choose({ kind: "session", offsetDays: preset.days })}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2 border-t border-border pt-2">
              <NumberInput value={days} onChange={setDays} min={0} max={MAX_DUE_OFFSET_DAYS} />
              <span className="flex-1 text-xs text-muted-foreground">days before</span>
              <Button size="sm" onClick={() => choose({ kind: "session", offsetDays: days })}>
                Set
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
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
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  selected: boolean;
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
