import {
  IconCalendarEvent,
  IconCheck,
  IconLoader2,
  IconAlertTriangle,
  IconTag,
  IconX,
} from "@tabler/icons-react";
import { type CSSProperties, type ReactNode, useState } from "react";
import { LabelDot } from "@/components/label-chip";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Calendar } from "@/components/ui/date-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Label, TaskStatus } from "@/lib/api/types";
import { cn } from "@/lib/utils";
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
      <PopoverContent className="w-56" align={align} onKeyDown={stopKeys}>
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
          <CommandList className="p-1">
            <CommandEmpty>No status found.</CommandEmpty>
            {statuses.map((status, i) => (
              <CommandItem key={status.id} value={status.name} onSelect={() => choose(status.id)}>
                <TaskStatusIcon status={status} kind={kindOf(status.id)} />
                <span className="truncate">{status.name}</span>
                {status.id === value && <IconCheck size={14} className="ml-auto" />}
                {i < 9 && <CommandShortcut className="w-3 text-center">{i + 1}</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/// Toggles labels one by one and stays open, so several can be set in a row.
export function LabelsPicker({
  labels,
  selected,
  onToggle,
  pendingId,
  failedId,
  align = "start",
  children,
}: {
  labels: Label[];
  selected: string[];
  onToggle: (labelId: string) => void;
  pendingId?: string;
  failedId?: string;
  align?: "start" | "end";
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-56" align={align} onKeyDown={stopKeys}>
        <Command loop>
          <CommandInput placeholder="Add labels…" />
          <CommandList className="p-1">
            <CommandEmpty>
              {labels.length === 0 ? "No labels in this Space yet." : "No label found."}
            </CommandEmpty>
            {labels.map((label) => {
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
          </CommandList>
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

/// Days until the coming Friday, or a week on when today already is one.
function daysToFriday(): number {
  const diff = (5 - new Date().getDay() + 7) % 7;
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
  /// Names the date in the search placeholder and the remove item.
  noun?: string;
  align?: "start" | "end";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const presets = [
    { label: "Today", day: addDays(0) },
    { label: "Tomorrow", day: addDays(1) },
    { label: "End of this week", day: addDays(daysToFriday()) },
    { label: "In one week", day: addDays(7) },
  ];

  function choose(day: string | null) {
    setOpen(false);
    if (day !== value) onSelect(day);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-68" align={align} onKeyDown={stopKeys}>
        <Command loop>
          <CommandInput placeholder={`Set ${noun}…`} />
          <CommandList className="p-1">
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup className="p-0">
              {presets.map((p) => (
                <CommandItem key={p.label} value={p.label} onSelect={() => choose(p.day)}>
                  <IconCalendarEvent />
                  <span className="truncate">{p.label}</span>
                  <CommandShortcut className="tracking-normal">{formatDay(p.day)}</CommandShortcut>
                </CommandItem>
              ))}
              {value && (
                <CommandItem value={`Remove ${noun}`} onSelect={() => choose(null)}>
                  <IconX />
                  Remove {noun}
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
          <CommandSeparator />
          <Calendar value={value} onSelect={choose} className="w-auto p-2" />
        </Command>
      </PopoverContent>
    </Popover>
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
