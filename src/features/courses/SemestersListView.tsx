import {
  IconArrowUpRight,
  IconCalendarWeek,
  IconChevronRight,
  IconDots,
  IconFlag,
  IconGripVertical,
  IconPencil,
  IconPlus,
  IconWand,
} from "@tabler/icons-react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ActionStatus,
  StatusAnnouncer,
  StatusButtonContent,
  StatusIcon,
  statusOf,
  useCloseAfterSuccess,
} from "@/components/action-feedback";
import { contextTarget, entityTarget } from "@/components/context-menu/registry";
import { EmptyState } from "@/components/empty-state";
import { EntityIcon } from "@/components/entity-icon";
import { FeedbackMenuItem } from "@/components/feedback-menu-item";
import { EntityKey } from "@/components/entity-key";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createSemester,
  listCourses,
  listSemesters,
  reorderSemesters,
  setCurrentSemester,
  updateSemester,
} from "@/lib/api/courses";
import { listRelationships } from "@/lib/api/relationships";
import type { Entity, Semester } from "@/lib/api/types";
import { updateEntity } from "@/lib/api/entities";
import { displayTitle } from "@/lib/entity-title";
import { useNavStore } from "@/lib/store/nav";
import { cn } from "@/lib/utils";
import { ACADEMIC_SYSTEMS, TERM_TYPE_META } from "./academic-terms";
import { orderSemesters, resolveActiveSemesterId } from "./current-semester";
import { SemesterSetupWizard } from "./SemesterSetupWizard";

/// The Semesters overview: chronological, not a card-grid — Semesters are
/// inherently sequential (PLAN §2), unlike independent entities like Courses.
/// Grouping Courses by Semester (with the course grid underneath each) lives
/// on the Courses page instead, so that's not duplicated here.
export function SemestersListView({ spaceId }: { spaceId: string }) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const { data: semesters = [] } = useQuery({
    queryKey: ["semesters", spaceId],
    queryFn: () => listSemesters(spaceId),
  });
  const { data: courses = [] } = useQuery({
    queryKey: ["courses", spaceId],
    queryFn: () => listCourses(spaceId),
  });
  // Same `queryKey` shape `CoursesListView` uses per-course — react-query
  // shares the cache, so this doesn't cost extra network calls there.
  const courseRelQueries = useQueries({
    queries: courses.map((course) => ({
      queryKey: ["relationships", course.id],
      queryFn: () => listRelationships(course.id, "both"),
    })),
  });

  const coursesBySemester = new Map<string, Entity[]>();
  courses.forEach((course, i) => {
    const link = (courseRelQueries[i]?.data ?? []).find(
      (r) => r.relationshipType === "course-semester" && r.fromEntityId === course.id,
    );
    if (!link) return;
    const list = coursesBySemester.get(link.toEntityId) ?? [];
    list.push(course);
    coursesBySemester.set(link.toEntityId, list);
  });

  const ordered = orderSemesters(semesters);
  const activeSemesterId = resolveActiveSemesterId(semesters);

  const reorder = useMutation({
    mutationFn: ({ orderedIds }: { orderedIds: string[]; draggedId: string }) =>
      reorderSemesters(orderedIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["semesters", spaceId] }),
  });
  const reorderStatusFor = (id: string): ActionStatus =>
    reorder.variables?.draggedId === id ? statusOf(reorder) : "idle";

  const handleDrop = (targetId: string) => {
    if (!draggingId || draggingId === targetId) return;
    const ids = ordered.map((s) => s.entity.id);
    const from = ids.indexOf(draggingId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    reorder.mutate({ orderedIds: ids, draggedId: draggingId });
    setDraggingId(null);
  };

  return (
    <div
      className="flex flex-col gap-6"
      {...contextTarget("module-view", {
        spaceId,
        createLabel: "New Semester",
        create: () => setCreateOpen(true),
      })}
    >
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Semesters</h1>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setWizardOpen(true)}
          >
            <IconWand size={14} /> Set up semesters
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <IconPlus size={14} /> New semester
          </Button>
        </div>
      </div>

      {semesters.length === 0 ? (
        <EmptyState
          icon={IconCalendarWeek}
          title="No semesters yet"
          description="Run the setup wizard to bootstrap a run of terms, or add one manually."
          action={{ label: "Set up semesters", onClick: () => setWizardOpen(true) }}
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          {ordered.map((semester) => (
            <SemesterRow
              key={semester.entity.id}
              semester={semester}
              active={semester.entity.id === activeSemesterId}
              spaceId={spaceId}
              courses={coursesBySemester.get(semester.entity.id) ?? []}
              dragging={draggingId === semester.entity.id}
              reorderStatus={reorderStatusFor(semester.entity.id)}
              onDragStart={() => setDraggingId(semester.entity.id)}
              onDragEnd={() => setDraggingId(null)}
              onDropOn={() => handleDrop(semester.entity.id)}
            />
          ))}
        </div>
      )}

      <CreateSemesterDialog open={createOpen} onOpenChange={setCreateOpen} spaceId={spaceId} />
      <SemesterSetupWizard open={wizardOpen} onOpenChange={setWizardOpen} spaceId={spaceId} />
    </div>
  );
}

/// The two-date form reused for backfilling approximate dates on a Semester —
/// cosmetic only (PLAN §1), never used for ordering or "current" detection.
function DateRangeForm({
  startDate,
  endDate,
  status,
  onSave,
}: {
  startDate: string;
  endDate: string;
  status: ActionStatus;
  onSave: (startDate: string, endDate: string) => void;
}) {
  const [start, setStart] = useState(startDate);
  const [end, setEnd] = useState(endDate);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (status !== "pending" && status !== "success") onSave(start, end);
      }}
      className="flex flex-col gap-2 p-1"
    >
      <label
        htmlFor="semester-start-date"
        className="flex flex-col gap-1 text-xs text-muted-foreground"
      >
        Start (approximate)
        <Input
          id="semester-start-date"
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="h-8 text-sm"
        />
      </label>
      <label
        htmlFor="semester-end-date"
        className="flex flex-col gap-1 text-xs text-muted-foreground"
      >
        End (approximate)
        <Input
          id="semester-end-date"
          type="date"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="h-8 text-sm"
        />
      </label>
      <Button type="submit" size="sm" disabled={!start && !end}>
        <StatusButtonContent
          status={status}
          label="Save"
          successLabel="Saved"
          errorLabel="Couldn't save, try again"
        />
      </Button>
    </form>
  );
}

function SemesterRow({
  semester,
  active,
  spaceId,
  courses,
  dragging,
  reorderStatus,
  onDragStart,
  onDragEnd,
  onDropOn,
}: {
  semester: Semester;
  active: boolean;
  spaceId: string;
  courses: Entity[];
  dragging: boolean;
  /// Pending or failed reorder, shown on the grip of the row that was dragged.
  reorderStatus: ActionStatus;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropOn: () => void;
}) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const [expanded, setExpanded] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(displayTitle(semester.entity));
  const [dragOver, setDragOver] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  const [datesOpen, setDatesOpen] = useState(false);
  const setDates = useMutation({
    mutationFn: (patch: { startDate?: string; endDate?: string }) =>
      updateSemester(semester.entity.id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["semesters", spaceId] }),
  });
  useCloseAfterSuccess(setDates, () => setDatesOpen(false));
  const resetDates = setDates.reset;
  useEffect(() => {
    if (!datesOpen) resetDates();
  }, [datesOpen, resetDates]);

  // The input stays mounted until the rename lands, so a failure has somewhere to show.
  const rename = useMutation({
    mutationFn: (title: string) => updateEntity(semester.entity.id, { title }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["semesters", spaceId] });
      setEditingTitle(false);
    },
  });
  const renameStatus = statusOf(rename);

  const [menuOpen, setMenuOpen] = useState(false);
  const [activeAtMenuOpen, setActiveAtMenuOpen] = useState(active);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const flagCurrent = () =>
    setCurrentSemester(spaceId, semester.entity.id).then(() =>
      queryClient.invalidateQueries({ queryKey: ["semesters", spaceId] }),
    );

  const dateRange =
    semester.startDate && semester.endDate
      ? `${format(new Date(semester.startDate), "MMM d")} – ${format(new Date(semester.endDate), "MMM d")}`
      : null;
  const termLabel = semester.termType ? TERM_TYPE_META[semester.termType]?.label : null;

  return (
    <div
      {...entityTarget(semester.entity, semester)}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onDropOn();
      }}
      className={cn(
        "group flex flex-col rounded-lg border bg-card transition-colors",
        active ? "border-primary/60 bg-primary/3" : "border-border",
        dragging && "opacity-40",
        dragOver && "border-primary",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="cursor-grab text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
              aria-label={
                reorderStatus === "error"
                  ? "Couldn't reorder, drag to try again"
                  : "Drag to reorder"
              }
            >
              <StatusIcon
                status={reorderStatus === "success" ? "idle" : reorderStatus}
                idle={<IconGripVertical size={14} />}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {reorderStatus === "error" ? "Couldn't reorder, drag to try again" : "Drag to reorder"}
          </TooltipContent>
        </Tooltip>
        <StatusAnnouncer
          message={reorderStatus === "error" ? "Couldn't reorder semesters" : null}
        />

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-muted-foreground hover:text-foreground"
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              <IconChevronRight
                size={14}
                className={cn("transition-transform", expanded && "rotate-90")}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent>{expanded ? "Collapse" : "Expand"}</TooltipContent>
        </Tooltip>

        <IconCalendarWeek size={14} className="shrink-0 text-muted-foreground" />

        {editingTitle ? (
          <span className="flex items-center gap-1">
            <Input
              ref={titleInputRef}
              value={titleDraft}
              aria-invalid={renameStatus === "error" || undefined}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => {
                if (rename.isPending) return;
                if (titleDraft.trim() && titleDraft !== semester.entity.title) {
                  rename.mutate(titleDraft.trim());
                } else {
                  rename.reset();
                  setTitleDraft(displayTitle(semester.entity));
                  setEditingTitle(false);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  rename.reset();
                  setTitleDraft(displayTitle(semester.entity));
                  setEditingTitle(false);
                }
              }}
              className="h-7 w-44 text-sm font-medium"
            />
            {renameStatus !== "idle" && renameStatus !== "success" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="flex shrink-0"
                    aria-label={
                      renameStatus === "error" ? "Couldn't rename, press Enter to retry" : "Saving"
                    }
                  >
                    <StatusIcon status={renameStatus} idle={null} />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {renameStatus === "error" ? "Couldn't rename, press Enter to retry" : "Saving"}
                </TooltipContent>
              </Tooltip>
            )}
            <StatusAnnouncer
              message={renameStatus === "error" ? "Couldn't rename semester" : null}
            />
          </span>
        ) : (
          <span className="flex min-w-0 items-center gap-1">
            <EntityKey entityKey={semester.entity.key} className="mr-0.5" />
            <button
              type="button"
              onClick={() => openEntity(semester.entity.id, spaceId)}
              className="truncate text-sm font-medium text-foreground hover:underline"
            >
              {displayTitle(semester.entity)}
            </button>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setEditingTitle(true)}
                  aria-label="Rename semester"
                  className="shrink-0 rounded-sm p-0.5 text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground group-hover:opacity-100"
                >
                  <IconPencil size={12} />
                </button>
              </TooltipTrigger>
              <TooltipContent>Rename semester</TooltipContent>
            </Tooltip>
          </span>
        )}

        {active && <Badge variant="default">Current</Badge>}

        <span className="text-xs text-muted-foreground">
          {courses.length} course{courses.length === 1 ? "" : "s"}
        </span>

        <CourseChips courses={courses} />

        <div className="ml-auto flex items-center gap-2">
          <Popover open={datesOpen} onOpenChange={setDatesOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "text-xs text-muted-foreground hover:text-foreground",
                  !dateRange && "underline-offset-2 hover:underline",
                )}
              >
                {dateRange ?? "Set dates"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56" align="end">
              <DateRangeForm
                startDate={semester.startDate ?? ""}
                endDate={semester.endDate ?? ""}
                status={statusOf(setDates)}
                onSave={(startDate, endDate) => setDates.mutate({ startDate, endDate })}
              />
            </PopoverContent>
          </Popover>

          <DropdownMenu
            open={menuOpen}
            onOpenChange={(open) => {
              // Judged at open, so the item keeps showing its success after the flag lands.
              if (open) setActiveAtMenuOpen(active);
              setMenuOpen(open);
            }}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label="Semester actions"
                  >
                    <IconDots size={14} />
                  </button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Semester actions</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              {activeAtMenuOpen ? (
                <DropdownMenuItem disabled>
                  <IconFlag size={14} className="text-muted-foreground" />
                  Flag as current
                </DropdownMenuItem>
              ) : (
                <FeedbackMenuItem
                  icon={<IconFlag size={14} className="text-muted-foreground" />}
                  label="Flag as current"
                  successLabel="Flagged as current"
                  errorLabel="Couldn't flag, try again"
                  action={async () => {
                    await flagCurrent();
                  }}
                  onDone={closeMenu}
                />
              )}
              <DropdownMenuItem onSelect={() => openEntity(semester.entity.id, spaceId)}>
                <IconArrowUpRight size={14} className="text-muted-foreground" />
                Open
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {expanded && (
        <div className="flex flex-col gap-1 border-t border-border px-9 py-2">
          {termLabel && semester.year != null && (
            <p className="text-xs text-muted-foreground">
              {termLabel} {semester.year}
            </p>
          )}
          {courses.length === 0 ? (
            <p className="py-1 text-xs text-muted-foreground">No courses linked yet.</p>
          ) : (
            courses.map((course) => (
              <button
                key={course.id}
                type="button"
                onClick={() => openEntity(course.id, spaceId)}
                {...entityTarget(course)}
                className="flex items-center gap-1.5 rounded-sm p-1 text-left text-sm text-foreground hover:bg-accent"
              >
                <EntityIcon entity={course} size={14} className="text-muted-foreground" />
                <EntityKey entityKey={course.key} />
                {displayTitle(course)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/// At-a-glance row of Course icons (PLAN §2) — expanding the row reveals full
/// names instead.
function CourseChips({ courses }: { courses: Entity[] }) {
  if (courses.length === 0) return null;
  const shown = courses.slice(0, 6);
  return (
    <div className="flex items-center -space-x-1">
      {shown.map((course) => (
        <span
          key={course.id}
          title={`${course.key} ${displayTitle(course)}`}
          className="flex size-5 items-center justify-center rounded-full border border-card bg-muted text-muted-foreground"
        >
          <EntityIcon entity={course} size={11} />
        </span>
      ))}
      {courses.length > shown.length && (
        <span className="flex size-5 items-center justify-center rounded-full border border-card bg-muted text-xs text-muted-foreground">
          +{courses.length - shown.length}
        </span>
      )}
    </div>
  );
}

function CreateSemesterDialog({
  open,
  onOpenChange,
  spaceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
}) {
  const queryClient = useQueryClient();
  const openEntity = useNavStore((s) => s.openEntity);
  const [title, setTitle] = useState("");
  const [termType, setTermType] = useState<string>("none");
  const [year, setYear] = useState(new Date().getFullYear());
  const inputRef = useRef<HTMLInputElement>(null);

  const create = useMutation({
    mutationFn: () =>
      createSemester(spaceId, title.trim(), {
        termType: termType === "none" ? null : termType,
        year: termType === "none" ? null : year,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["semesters", spaceId] }),
  });
  const { reset } = create;
  useCloseAfterSuccess(create, () => {
    onOpenChange(false);
    if (create.data) openEntity(create.data.entity.id, spaceId);
  });

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else {
      setTitle("");
      setTermType("none");
      reset();
    }
  }, [open, reset]);

  const submit = () => {
    if (title.trim() && !create.isPending && !create.isSuccess) create.mutate();
  };

  const allTerms = Object.values(ACADEMIC_SYSTEMS).flatMap((s) => s.terms);
  const seenKeys = new Set<string>();
  const termOptions = allTerms.filter((t) =>
    seenKeys.has(t.key) ? false : (seenKeys.add(t.key), true),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New semester</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-2"
        >
          <Input
            ref={inputRef}
            placeholder="e.g. Winter 2026/27"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Select value={termType} onValueChange={setTermType}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Term (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No term set</SelectItem>
                {termOptions.map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {termType !== "none" && (
              <NumberInput value={year} onChange={setYear} min={2000} max={2100} />
            )}
          </div>
        </form>
        <DialogFooter>
          <Button disabled={!title.trim()} onClick={submit}>
            <StatusButtonContent
              status={statusOf(create)}
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
