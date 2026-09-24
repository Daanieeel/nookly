import {
  IconAdjustmentsHorizontal,
  IconCalendarDue,
  IconCaretDownFilled,
  IconCaretRightFilled,
  IconCircleDot,
  IconClipboardCheck,
  IconClockPlus,
  IconPlus,
  IconSchool,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  StatusButtonContent,
  StatusIcon,
  statusOf,
  useCloseAfterSuccess,
} from "@/components/action-feedback";
import { contextTarget, entityTarget } from "@/components/context-menu/registry";
import { EmptyState } from "@/components/empty-state";
import { EntityKey } from "@/components/entity-key";
import { EntityPickerPopover, EntityPickerValue } from "@/components/entity-picker";
import {
  type ActiveFilter,
  type FilterField,
  FilterMenu,
  applyFilters,
} from "@/components/filter-menu";
import { badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CourseChip, useCourseLookup } from "@/features/courses/course-lookup";
import { moveRowFocus } from "@/features/tasks/TaskList";
import { useCreateShortcut } from "@/hooks/use-create-shortcut";
import { createAssignment, listAssignments, updateAssignmentStatus } from "@/lib/api/assignments";
import type { Assignment, Entity } from "@/lib/api/types";
import { displayTitle } from "@/lib/entity-title";
import { useNavStore } from "@/lib/store/nav";
import { cn } from "@/lib/utils";
import {
  ASSIGNMENT_STATUSES,
  type Bucket,
  type Grouping,
  type Tone,
  bucketAssignments,
  isDone,
  readGrouping,
  statusLabel,
  writeGrouping,
} from "./assignment-buckets";
import { formatShortDate, formatWeekday } from "@/lib/datetime";

const GROUPINGS: { id: Grouping; label: string; icon: TablerIcon }[] = [
  { id: "deadline", label: "Deadline", icon: IconCalendarDue },
  { id: "created", label: "Created", icon: IconClockPlus },
];

const TONE_TEXT = {
  destructive: "text-destructive",
  caution: "text-caution",
  positive: "text-positive",
  muted: "text-muted-foreground",
} satisfies Record<Tone, string>;

function courseFilter(courseId: string | undefined): ActiveFilter[] {
  return courseId ? [{ fieldId: "course", operator: "is", values: [courseId] }] : [];
}

/// An inbox to work through: assignments sorted into time buckets (Overdue, Today,
/// This Week...) by due date, or by when they were added. A Course page's "view all"
/// lands here with `filterCourseId`, applied as a regular Course filter.
export function AssignmentsListView({
  spaceId,
  filterCourseId,
}: {
  spaceId: string;
  filterCourseId?: string;
}) {
  const openEntity = useNavStore((s) => s.openEntity);
  const [createOpen, setCreateOpen] = useState(false);
  const [grouping, setGroupingState] = useState<Grouping>(readGrouping);
  const [filters, setFilters] = useState<ActiveFilter[]>(() => courseFilter(filterCourseId));

  useEffect(() => setFilters(courseFilter(filterCourseId)), [filterCourseId]);

  const { data: assignments = [], isPending } = useQuery({
    queryKey: ["assignments", spaceId],
    queryFn: () => listAssignments(spaceId),
  });
  const { courses, courseOf } = useCourseLookup(spaceId, "assignment-course");

  const startCreate = useCallback(() => setCreateOpen(true), []);
  useCreateShortcut(startCreate);

  const setGrouping = (next: Grouping) => {
    setGroupingState(next);
    writeGrouping(next);
  };

  const filterFields = useMemo<FilterField[]>(
    () => [
      {
        id: "course",
        label: "Course",
        icon: IconSchool,
        options: courses.map((c) => ({ value: c.id, label: displayTitle(c) })),
      },
      {
        id: "status",
        label: "Status",
        icon: IconCircleDot,
        options: ASSIGNMENT_STATUSES.map((s) => ({ value: s.id, label: s.label })),
      },
    ],
    [courses],
  );

  const visible = applyFilters(assignments, filters, (a, fieldId) =>
    fieldId === "course" ? (courseOf.get(a.entity.id)?.id ?? "") : a.status,
  );
  const buckets = bucketAssignments(visible, grouping);

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      {...contextTarget("module-view", {
        spaceId,
        createLabel: "New Assignment",
        create: startCreate,
      })}
    >
      <header className="flex min-h-12 shrink-0 items-center gap-3 border-b border-border py-2 pr-2 pl-4">
        <h1 className="flex items-center gap-2 text-sm font-medium">
          <IconClipboardCheck size={16} className="text-muted-foreground" />
          Assignments
        </h1>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
          <div className="min-w-0 flex-1">
            <FilterMenu fields={filterFields} filters={filters} onFiltersChange={setFilters} />
          </div>
          <AssignmentDisplayMenu grouping={grouping} onChange={setGrouping} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="secondary" size="sm" className="ml-1 gap-1.5" onClick={startCreate}>
                <IconPlus />
                New assignment
              </Button>
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-2">
              Create an assignment <Kbd>C</Kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      {!isPending && assignments.length === 0 ? (
        <div className="p-6">
          <EmptyState
            icon={IconClipboardCheck}
            title="No assignments yet"
            description="Press C to add one. Pick its Course and due date, the rest comes later."
            action={{ label: "New assignment", onClick: startCreate }}
          />
        </div>
      ) : buckets.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <p className="text-sm text-muted-foreground">No assignments match these filters.</p>
          <Button variant="ghost" size="sm" onClick={() => setFilters([])}>
            Clear filters
          </Button>
        </div>
      ) : (
        // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- only forwards arrow keys between the row buttons inside
        <div className="min-h-0 flex-1 overflow-y-auto pb-6" onKeyDown={moveRowFocus}>
          {buckets.map((bucket) => (
            <BucketSection
              // Remount on regrouping so each bucket starts from its own default.
              key={`${grouping}:${bucket.id}`}
              bucket={bucket}
              courseOf={courseOf}
              onOpen={(a) => openEntity(a.entity.id, spaceId)}
            />
          ))}
        </div>
      )}

      <CreateAssignmentDialog spaceId={spaceId} open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

/// The "Display" popover, as on the Tasks page: which date sorts rows into buckets.
function AssignmentDisplayMenu({
  grouping,
  onChange,
}: {
  grouping: Grouping;
  onChange: (grouping: Grouping) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <IconAdjustmentsHorizontal />
          Display
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-64 flex-col gap-2 p-3">
        <span className="text-xs text-muted-foreground">Group by</span>
        <div className="grid grid-cols-2 gap-2">
          {GROUPINGS.map((g) => (
            <button
              key={g.id}
              type="button"
              aria-pressed={grouping === g.id}
              onClick={() => onChange(g.id)}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-1 rounded-md border border-border py-2 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground",
                grouping === g.id && "border-foreground/20 bg-accent text-foreground",
              )}
            >
              <g.icon size={16} />
              {g.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function BucketSection({
  bucket,
  courseOf,
  onOpen,
}: {
  bucket: Bucket;
  courseOf: Map<string, Entity>;
  onOpen: (assignment: Assignment) => void;
}) {
  const [collapsed, setCollapsed] = useState(bucket.collapsed ?? false);
  return (
    <section aria-label={bucket.label}>
      <div className="sticky top-0 z-10 bg-card">
        <div className="flex h-9 items-center border-b border-border bg-foreground/4 px-2">
          <button
            type="button"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((c) => !c)}
            className="flex h-7 min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-accent/60"
          >
            {collapsed ? (
              <IconCaretRightFilled size={10} className="text-muted-foreground" />
            ) : (
              <IconCaretDownFilled size={10} className="text-muted-foreground" />
            )}
            <bucket.icon size={14} className={TONE_TEXT[bucket.tone]} />
            <span className="truncate font-medium">{bucket.label}</span>
            <span className="text-muted-foreground tabular-nums">{bucket.items.length}</span>
          </button>
        </div>
      </div>
      {!collapsed &&
        bucket.items.map((a) => (
          <AssignmentRow
            key={a.entity.id}
            assignment={a}
            course={courseOf.get(a.entity.id)}
            onOpen={() => onOpen(a)}
          />
        ))}
    </section>
  );
}

function AssignmentRow({
  assignment,
  course,
  onOpen,
}: {
  assignment: Assignment;
  course: Entity | undefined;
  onOpen: () => void;
}) {
  const title = displayTitle(assignment.entity);
  const done = isDone(assignment);
  return (
    <div
      className="relative flex h-12 items-center gap-3 border-b border-border/60 px-4 transition-colors focus-within:bg-accent/50 hover:bg-accent/40"
      {...entityTarget(assignment.entity, assignment)}
    >
      <button
        type="button"
        data-task-row
        aria-label={`Open ${title}`}
        onClick={onOpen}
        className="absolute inset-0 cursor-pointer outline-none"
      />
      <DueCell dueDate={assignment.dueDate} done={done} />
      <EntityKey
        entityKey={assignment.entity.key}
        className="pointer-events-none relative hidden w-16 sm:block"
      />
      <span
        className={cn(
          "pointer-events-none relative min-w-0 flex-1 truncate text-sm",
          done && "text-muted-foreground",
        )}
      >
        {title}
      </span>
      {course && (
        <CourseChip course={course} className="pointer-events-none relative max-md:hidden" />
      )}
      {assignment.grade !== null && (
        <span className="pointer-events-none relative shrink-0 text-xs text-muted-foreground tabular-nums">
          Grade <span className="font-medium text-foreground">{assignment.grade}</span>
        </span>
      )}
      <AssignmentStatusMenu assignment={assignment} />
    </div>
  );
}

/// The due date leads the row: the day itself, and below it how far away it is.
function DueCell({ dueDate, done }: { dueDate: string | null; done: boolean }) {
  if (!dueDate) {
    return (
      <span className="pointer-events-none relative w-20 shrink-0 text-xs text-muted-foreground/60">
        No date
      </span>
    );
  }
  const day = parseISO(dueDate);
  const days = differenceInCalendarDays(day, new Date());
  let relative = `in ${days} days`;
  let tone = "text-muted-foreground";
  if (days < 0) {
    relative = done ? `${-days}d ago` : `${-days}d overdue`;
    if (!done) tone = "text-destructive";
  } else if (days === 0) {
    relative = "Today";
    if (!done) tone = "text-caution";
  } else if (days === 1) {
    relative = "Tomorrow";
  }
  return (
    <span className="pointer-events-none relative flex w-20 shrink-0 flex-col leading-tight">
      <time dateTime={dueDate} className="text-xs font-medium tabular-nums">
        {`${formatWeekday(day, "short")}, ${formatShortDate(day)}`}
      </time>
      <span className={cn("text-xs", tone)}>{relative}</span>
    </span>
  );
}

function statusVariant(status: string) {
  if (status === "in_progress") return "primary";
  if (status === "submitted" || status === "graded") return "positive";
  return "secondary";
}

/// The status as a badge that opens a picker, so moving through the inbox never
/// needs the detail view.
function AssignmentStatusMenu({ assignment }: { assignment: Assignment }) {
  const queryClient = useQueryClient();
  const change = useMutation({
    mutationFn: (status: string) =>
      updateAssignmentStatus(assignment.entity.id, status, assignment.grade),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["assignments", assignment.entity.spaceId] }),
  });
  const status = statusOf(change);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={
            status === "error"
              ? "Couldn't change status, try again"
              : `Status: ${statusLabel(assignment.status)}`
          }
          className={cn(
            badgeVariants({
              variant: status === "error" ? "destructive" : statusVariant(assignment.status),
              size: "md",
            }),
            "relative w-24 shrink-0 cursor-pointer justify-center gap-1 transition-opacity hover:opacity-80",
          )}
        >
          <StatusIcon status={status === "success" ? "idle" : status} idle={null} size={12} />
          {statusLabel(assignment.status)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={assignment.status}
          onValueChange={(next) => next !== assignment.status && change.mutate(next)}
        >
          {ASSIGNMENT_STATUSES.map((s) => (
            <DropdownMenuRadioItem key={s.id} value={s.id}>
              {s.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CreateAssignmentDialog({
  spaceId,
  open,
  onOpenChange,
}: {
  spaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const [course, setCourse] = useState<Entity | null>(null);
  const [dueDate, setDueDate] = useState("");

  const create = useMutation({
    mutationFn: () => {
      if (!course) throw new Error("pick a course");
      return createAssignment(
        spaceId,
        `${displayTitle(course)} Assignment`,
        course.id,
        dueDate || null,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignments", spaceId] });
      if (course) queryClient.invalidateQueries({ queryKey: ["relationships", course.id] });
    },
  });
  const createStatus = statusOf(create);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setCourse(null);
      setDueDate("");
      create.reset();
    }
  }

  useCloseAfterSuccess(create, () => {
    const created = create.data;
    handleOpenChange(false);
    if (created) openEntity(created.entity.id, spaceId);
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New assignment</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <EntityPickerPopover
            spaceId={spaceId}
            typeFilter="course"
            trigger={
              <Button variant="secondary" size="sm" className="w-full justify-start">
                <EntityPickerValue entity={course} placeholder="Pick a course…" />
              </Button>
            }
            onSelect={setCourse}
          />
          <DateInput
            aria-label="Due date"
            placeholder="Due date…"
            value={dueDate || null}
            onChange={(day) => setDueDate(day ?? "")}
          />
          <p className="text-xs text-muted-foreground">
            Status and grade can be filled in afterward.
          </p>
        </div>
        <DialogFooter>
          <Button
            size="sm"
            disabled={!course}
            onClick={() => (createStatus === "idle" || createStatus === "error") && create.mutate()}
          >
            <StatusButtonContent
              status={createStatus}
              label="Create"
              successLabel="Created"
              errorLabel="Couldn't create, try again"
            />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
