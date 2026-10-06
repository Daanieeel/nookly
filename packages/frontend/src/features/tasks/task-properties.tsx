import {
  IconCalendarEvent,
  IconCheck,
  IconLoader2,
  IconPlus,
  IconAlertTriangle,
  IconTag,
  IconX,
} from "@tabler/icons-react";
import { type CSSProperties, type ReactNode, useState } from "react";
import { DueDateLabel } from "#/components/due-columns.tsx";
import { LabelDot } from "#/components/label-chip.tsx";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@nookly/ui/components/command";
import { Calendar } from "#/components/date-input.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import type { Label, TaskStatus } from "#/lib/api/types.ts";
import { EFFORT_STEPS, effortLabel, useEffortSettings } from "#/lib/effort.ts";
import { DialogCommandList } from "#/components/dialog-command-list.tsx";
import { dialogPopover } from "#/lib/dialog-popover.ts";
import { cn } from "@nookly/ui/lib/utils";
import { type StatusKind, formatDay, toDay } from "./task-model";

/// Linear style status glyph: a dashed ring for the backlog, an empty ring for
/// unstarted, a ring filling up with the doneness while started, a solid check once
/// completed and a solid cross when canceled. Drawn in the status color.
export function TaskStatusIcon({
  status,
  kind,
  size = 14,
  className,
}: {
  status: TaskStatus;
  kind: StatusKind;
  size?: number;
  className?: string;
}) {
  const fill = 2 * Math.PI * 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
      className={cn("shrink-0 text-(--status-color)", className)}
      // SAFETY: `--status-color` only ever receives `status.color`, a plain hex string
      // from the task-statuses API. `CSSProperties` just doesn't model custom properties.
      style={{ "--status-color": status.color } as CSSProperties}
    >
      {kind === "completed" || kind === "canceled" ? (
        <>
          <circle cx="7" cy="7" r="7" fill="currentColor" />
          <path
            d={
              kind === "completed" ? "M4.2 7.2 6.1 9.1 9.8 5.2" : "M4.9 4.9 9.1 9.1M9.1 4.9 4.9 9.1"
            }
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-card"
          />
        </>
      ) : (
        <>
          <circle
            cx="7"
            cy="7"
            r="6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray={kind === "backlog" ? "1.4 1.74" : undefined}
          />
          {kind === "started" && (
            <circle
              cx="7"
              cy="7"
              r="2"
              stroke="currentColor"
              strokeWidth="4"
              strokeDasharray={`${(status.doneness / 100) * fill} ${fill}`}
              transform="rotate(-90 7 7)"
            />
          )}
        </>
      )}
    </svg>
  );
}

/// A small bordered chip for one property, like the ones under a Linear card title.
export const PROPERTY_PILL =
  "inline-flex h-6 max-w-40 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-foreground/10 px-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground";

/// Stand in for a picker's leading icon while its change saves or after it failed.
export function PendingIcon({
  pending,
  failed,
  idle,
}: {
  pending: boolean;
  failed: boolean;
  idle: ReactNode;
}) {
  if (pending) return <IconLoader2 size={14} className="animate-spin text-muted-foreground" />;
  if (failed) return <IconAlertTriangle size={14} className="text-destructive" />;
  return idle;
}

/// Keys typed into a picker must not reach the list or board shortcuts behind it.
function stopKeys(e: React.KeyboardEvent) {
  e.stopPropagation();
}

export function StatusPicker({
  statuses,
  kindOf,
  value,
  onSelect,
  align = "start",
  children,
}: {
  statuses: TaskStatus[];
  kindOf: (statusId: string) => StatusKind;
  value: string | undefined;
  onSelect: (statusId: string) => void;
  align?: "start" | "end";
  /// The trigger.
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  function choose(statusId: string) {
    setOpen(false);
    setSearch("");
    if (statusId !== value) onSelect(statusId);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent {...dialogPopover("w-56")} align={align} onKeyDown={stopKeys}>
        <Command loop>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Change status…"
            onKeyDown={(e) => {
              // Number keys pick a status straight away, as in Linear.
              const index = Number(e.key) - 1;
              if (search === "" && index >= 0 && index < Math.min(9, statuses.length)) {
                e.preventDefault();
                choose(statuses[index].id);
              }
            }}
          />
          <DialogCommandList>
            <CommandEmpty>No status found.</CommandEmpty>
            {statuses.map((status, i) => (
              <CommandItem key={status.id} value={status.name} onSelect={() => choose(status.id)}>
                <TaskStatusIcon status={status} kind={kindOf(status.id)} />
                <span className="truncate">{status.name}</span>
                {status.id === value && <IconCheck size={14} className="ml-auto" />}
                {i < 9 && <CommandShortcut className="w-3 text-center">{i + 1}</CommandShortcut>}
              </CommandItem>
            ))}
          </DialogCommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/// Toggles labels one by one and stays open, so several can be set in a row.
/// With `onCreate`, a search that matches no label offers to create it.
export function LabelsPicker({
  labels,
  selected,
  onToggle,
  onCreate,
  pendingId,
  failedId,
  creating = false,
  align = "start",
  children,
}: {
  labels: Label[];
  selected: string[];
  onToggle: (labelId: string) => void;
  onCreate?: (name: string) => void;
  pendingId?: string;
  failedId?: string;
  /// True while `onCreate` runs.
  creating?: boolean;
  align?: "start" | "end";
  children: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const name = search.trim();
  const exists = labels.some((l) => l.name.toLowerCase() === name.toLowerCase());

  // Selected labels float to the top for fast deselecting, frozen at the
  // order they were in when the popover opened — recomputing this on every
  // toggle would reorder options out from under a user mid-click.
  const [order, setOrder] = useState<string[] | null>(null);
  const orderedLabels = order
    ? [...labels].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
    : labels;

  return (
    <Popover
      onOpenChange={(open) => {
        if (!open) {
          setSearch("");
          return;
        }
        const selectedIds = labels.filter((l) => selected.includes(l.id)).map((l) => l.id);
        const unselectedIds = labels.filter((l) => !selected.includes(l.id)).map((l) => l.id);
        setOrder([...selectedIds, ...unselectedIds]);
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent {...dialogPopover("w-56")} align={align} onKeyDown={stopKeys}>
        <Command loop>
          <CommandInput
            placeholder={onCreate ? "Find or create labels…" : "Add labels…"}
            value={search}
            onValueChange={setSearch}
          />
          {selected.length > 0 && (
            // Outside the scrolling list, so it stays put like the search box.
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2 border-b border-border px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => selected.forEach(onToggle)}
            >
              <IconX size={14} />
              Clear all
            </button>
          )}
          <DialogCommandList>
            {!(onCreate && name) && (
              <CommandEmpty>
                {labels.length === 0 ? "No labels in this Space yet." : "No label found."}
              </CommandEmpty>
            )}
            {onCreate && name && !exists && (
              <CommandItem
                value={`create ${name}`}
                forceMount
                onSelect={() => {
                  if (creating) return;
                  onCreate(name);
                  setSearch("");
                }}
              >
                <span className="flex size-4 items-center justify-center">
                  <PendingIcon pending={creating} failed={false} idle={<IconPlus size={14} />} />
                </span>
                <span className="truncate">Create “{name}”</span>
              </CommandItem>
            )}
            {orderedLabels.map((label) => {
              const checked = selected.includes(label.id);
              return (
                <CommandItem key={label.id} value={label.name} onSelect={() => onToggle(label.id)}>
                  <span
                    className={cn(
                      "flex size-4 items-center justify-center rounded-sm border border-input",
                      checked && "border-primary bg-primary",
                    )}
                  >
                    <PendingIcon
                      pending={pendingId === label.id}
                      failed={failedId === label.id}
                      idle={checked && <IconCheck size={12} className="text-primary-foreground" />}
                    />
                  </span>
                  <LabelDot label={label} />
                  <span className="truncate">{label.name}</span>
                </CommandItem>
              );
            })}
          </DialogCommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/// Picks the effort estimate, named in whichever scale the settings use.
export function EffortPicker({
  value,
  onSelect,
  align = "start",
  children,
}: {
  value: number | null;
  onSelect: (effort: number | null) => void;
  align?: "start" | "end";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const scale = useEffortSettings((s) => s.scale);

  function choose(effort: number | null) {
    setOpen(false);
    if (effort !== value) onSelect(effort);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent {...dialogPopover("w-48")} align={align} onKeyDown={stopKeys}>
        <Command loop>
          <CommandInput placeholder="Set effort…" />
          <DialogCommandList>
            <CommandEmpty>No size found.</CommandEmpty>
            {EFFORT_STEPS.map((step) => (
              <CommandItem
                key={step.value}
                value={`${step.tshirt} ${step.value}`}
                onSelect={() => choose(step.value)}
              >
                <span className="truncate">{effortLabel(step.value, scale)}</span>
                {step.value === value && <IconCheck size={14} className="ml-auto" />}
              </CommandItem>
            ))}
            {value != null && (
              <>
                <CommandSeparator />
                <CommandItem value="remove effort" onSelect={() => choose(null)}>
                  <IconX size={14} />
                  Remove effort
                </CommandItem>
              </>
            )}
          </DialogCommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function addDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDay(date);
}

/// The same day next month, or its last day when next month is shorter (Jan 31 is Feb 28).
function inOneMonth(): string {
  const today = new Date();
  const lastOfNext = new Date(today.getFullYear(), today.getMonth() + 2, 0).getDate();
  return toDay(
    new Date(today.getFullYear(), today.getMonth() + 1, Math.min(today.getDate(), lastOfNext)),
  );
}

/// Days until the coming `weekday` (0 is Sunday), or a week on when today already is one.
function daysTo(weekday: number): number {
  const diff = (weekday - new Date().getDay() + 7) % 7;
  return diff === 0 ? 7 : diff;
}

export function DueDatePicker({
  value,
  onSelect,
  noun = "due date",
  align = "start",
  children,
}: {
  value: string | null;
  onSelect: (day: string | null) => void;
  /// Names the date in the remove item.
  noun?: string;
  align?: "start" | "end";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  function choose(day: string | null) {
    setOpen(false);
    if (day !== value) onSelect(day);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        {...dialogPopover(
          // Capped to the room it has, so a short window scrolls it instead of letting
          // it run off the window.
          "max-h-(--radix-popover-content-available-height) w-120 overflow-y-auto",
        )}
        align={align}
        onKeyDown={stopKeys}
      >
        <DueDateChooser value={value} onSelect={choose} noun={noun} />
      </PopoverContent>
    </Popover>
  );
}

/// The date picker's content: the presets and the remove item beside a calendar, half
/// the width each (30rem in all).
/// Also used inside other popovers, e.g. an assignment's due date step.
export function DueDateChooser({
  value,
  onSelect,
  noun = "due date",
}: {
  value: string | null;
  onSelect: (day: string | null) => void;
  /// Names the date in the remove item.
  noun?: string;
}) {
  const presets = [
    { label: "Today", day: addDays(0) },
    { label: "Tomorrow", day: addDays(1) },
    { label: "End of work week", day: addDays(daysTo(5)) },
    { label: "Next Monday", day: addDays(daysTo(1)) },
    { label: "In one week", day: addDays(7) },
    { label: "In two weeks", day: addDays(14) },
    { label: "In one month", day: inOneMonth() },
  ];
  return (
    <div className="flex items-stretch" onKeyDown={stopKeys}>
      <Command loop className="w-1/2">
        {/* No cap of its own: the presets are short, and the calendar beside them sets the
            height, so they never scroll when the remove row appears. */}
        <CommandList className="max-h-none overflow-visible p-1">
          <CommandEmpty>No match.</CommandEmpty>
          <CommandGroup className="p-0">
            {presets.map((p) => (
              <CommandItem key={p.label} value={p.label} onSelect={() => onSelect(p.day)}>
                <IconCalendarEvent />
                <span className="truncate">{p.label}</span>
                <CommandShortcut className="tracking-normal">{formatDay(p.day)}</CommandShortcut>
              </CommandItem>
            ))}
            {value && (
              <CommandItem value={`Remove ${noun}`} onSelect={() => onSelect(null)}>
                <IconX />
                Remove {noun}
              </CommandItem>
            )}
          </CommandGroup>
        </CommandList>
      </Command>
      <div className="w-1/2 border-l border-border">
        <Calendar value={value} onSelect={onSelect} className="w-full p-2" />
      </div>
    </div>
  );
}

/// A list row's due day that opens the date picker, with a spinner while saving
/// and a warning after a failed save. Shows "No date" when unset, so one can be set.
export function DueDateButton({
  value,
  onSelect,
  renderPicker,
  pending,
  failed,
}: {
  value: string | null;
  onSelect?: (day: string | null) => void;
  /// Wraps the button in a different picker than the date one, e.g. an assignment's.
  renderPicker?: (trigger: ReactNode) => ReactNode;
  pending: boolean;
  failed: boolean;
}) {
  const trigger = (
    <button
      type="button"
      aria-label={failed ? "Couldn't set due date, try again" : "Change Due Date"}
      className={cn(
        "pointer-events-auto -ml-1 flex h-6 max-w-full cursor-pointer items-center gap-1 truncate rounded-sm px-1 hover:bg-accent data-[state=open]:bg-accent",
        failed && "text-destructive",
      )}
    >
      <PendingIcon pending={pending} failed={failed} idle={null} />
      <DueDateLabel dueDate={value} />
    </button>
  );
  return (
    renderPicker?.(trigger) ?? (
      <DueDatePicker value={value} onSelect={(day) => onSelect?.(day)}>
        {trigger}
      </DueDatePicker>
    )
  );
}

/// The due date as a pill: red once overdue, yellow when due today or tomorrow.
export function DueLabel({ day, tone }: { day: string; tone: "overdue" | "soon" | null }) {
  return (
    <>
      <IconCalendarEvent
        size={14}
        className={cn(
          "shrink-0",
          tone === "overdue" && "text-destructive",
          tone === "soon" && "text-caution",
        )}
      />
      <span className={cn("truncate", tone === "overdue" && "text-destructive")}>
        {formatDay(day)}
      </span>
      {tone === "overdue" && <span className="sr-only">(overdue)</span>}
    </>
  );
}

export function LabelsPlaceholder() {
  return (
    <>
      <IconTag size={14} className="shrink-0" />
      Labels
    </>
  );
}
