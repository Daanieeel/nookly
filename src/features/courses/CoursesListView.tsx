import {
  IconArrowRight,
  IconCalendar,
  IconCalendarStats,
  IconCalendarWeek,
  IconCaretDownFilled,
  IconCaretRightFilled,
  IconClipboardList,
  IconExternalLink,
  IconPlus,
  IconSchool,
  IconStack2,
  IconWriting,
} from "@tabler/icons-react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays, startOfDay } from "date-fns";
import { useEffect, useRef, useState } from "react";
import {
  StatusAnnouncer,
  StatusButtonContent,
  StatusIcon,
  statusOf,
  statusTextClass,
  useCloseAfterSuccess,
} from "@/components/action-feedback";
import { contextTarget, entityTarget } from "@/components/context-menu/registry";
import { EntityIcon } from "@/components/entity-icon";
import { EntityPickerPopover } from "@/components/entity-picker";
import { EntityKey } from "@/components/entity-key";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GalleryCard, GalleryCardBanner, GalleryCardBody } from "@/components/ui/gallery-card";
import { Input } from "@/components/ui/input";
import { ProgressCircle } from "@/components/ui/progress-circle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { listAssignments } from "@/lib/api/assignments";
import { createCourse, listCourses, listSemesters, setCourseSemester } from "@/lib/api/courses";
import { getEntity } from "@/lib/api/entities";
import { listExams } from "@/lib/api/exams";
import { listRelationships } from "@/lib/api/relationships";
import { listSessions } from "@/lib/api/sessions";
import type { Assignment, Entity, Exam, Semester, SessionOccurrence } from "@/lib/api/types";
import { displayTitle } from "@/lib/entity-title";
import { gradientForName } from "@/lib/gallery-color";
import { useNavStore } from "@/lib/store/nav";
import { cn } from "@/lib/utils";
import { resolveActiveSemesterId } from "./current-semester";
import { formatClock, formatShortDate, formatWeekday } from "@/lib/datetime";

/// Assignment statuses that count as "done" for the course card's progress
/// ring, mirroring `isDone` in `assignment-model.ts`.
const DONE_ASSIGNMENT_STATUSES = new Set(["submitted", "graded"]);

/// "in Nd" within a week, else "MMM d" — same convention as `SidebarUrgencyChip`
/// (`src/components/sidebar/sidebar-badges.tsx`), copied rather than imported
/// since that component is styled for the sidebar's own color tokens.
function dateLabel(date: string): string {
  const days = differenceInCalendarDays(new Date(date), new Date());
  return days <= 7 ? `${Math.max(days, 0)}d` : formatShortDate(date);
}

/// Card-grid identity (name, semester chips, sequel/prequel indicators) rather than
/// a bare table (§2.3) — a Course's relationships (semester, sequel-of/prequel-of)
/// all come from the generic relationship system (§5.4), not dedicated fields.
/// Semesters themselves live on their own page (Semesters module) — this view
/// only links a course to one via the "Link semester" picker below.
export function CoursesListView({ spaceId }: { spaceId: string }) {
  const openEntity = useNavStore((s) => s.openEntity);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: courses = [] } = useQuery({
    queryKey: ["courses", spaceId],
    queryFn: () => listCourses(spaceId),
  });
  const { data: semesters = [] } = useQuery({
    queryKey: ["semesters", spaceId],
    queryFn: () => listSemesters(spaceId),
  });
  // Fetched once here (not per-card) and cross-referenced against each
  // course's own relationships below, so the gallery's progress rings/next-
  // session stat don't cost N extra queries per course.
  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions", spaceId],
    queryFn: () => listSessions(spaceId),
  });
  const { data: exams = [] } = useQuery({
    queryKey: ["exams", spaceId],
    queryFn: () => listExams(spaceId),
  });
  const { data: assignments = [] } = useQuery({
    queryKey: ["assignments", spaceId],
    queryFn: () => listAssignments(spaceId),
  });
  // Same `queryKey` each `CourseCard` uses for its own relationships query —
  // react-query shares the cache, so grouping by semester here doesn't cost
  // extra network calls.
  const courseRelQueries = useQueries({
    queries: courses.map((course) => ({
      queryKey: ["relationships", course.id],
      queryFn: () => listRelationships(course.id, "both"),
    })),
  });

  const semesterIdByCourse = new Map<string, string>();
  courses.forEach((course, i) => {
    const link = (courseRelQueries[i]?.data ?? []).find(
      (r) => r.relationshipType === "course-semester" && r.fromEntityId === course.id,
    );
    if (link) semesterIdByCourse.set(course.id, link.toEntityId);
  });

  const activeSemesterId = resolveActiveSemesterId(semesters);
  const activeSemester = semesters.find((s) => s.entity.id === activeSemesterId);
  const coursesFor = (semesterId: string | null) =>
    courses.filter((c) => (semesterIdByCourse.get(c.id) ?? null) === semesterId);
  const otherSemesters = semesters
    .filter((s) => s.entity.id !== activeSemesterId)
    .sort((a, b) =>
      (b.startDate ?? b.entity.createdAt).localeCompare(a.startDate ?? a.entity.createdAt),
    );

  const cardsProps = { spaceId, sessions, exams, assignments };

  return (
    <div
      className="flex flex-col gap-3"
      {...contextTarget("module-view", {
        spaceId,
        createLabel: "New Course",
        create: () => setCreateOpen(true),
      })}
    >
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Courses</h1>
        <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <IconPlus size={14} /> New course
        </Button>
      </div>

      {courses.length === 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <CoursesEmptyCard onCreate={() => setCreateOpen(true)} />
          {PLACEHOLDER_COURSES.map((p, i) => (
            <CoursePlaceholderCard key={i} {...p} />
          ))}
        </div>
      ) : semesters.length === 0 ? (
        // No Semester exists yet — grouping (and an "Active" section with
        // nothing to contrast against) wouldn't mean anything, so stay flat.
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              onOpen={() => openEntity(course.id, spaceId)}
              {...cardsProps}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <CourseSection
            title={activeSemester ? displayTitle(activeSemester.entity) : "Active"}
            badge="Active"
            semester={activeSemester}
            spaceId={spaceId}
            defaultOpen
            courses={coursesFor(activeSemesterId)}
          >
            {(course) => (
              <CourseCard
                key={course.id}
                course={course}
                onOpen={() => openEntity(course.id, spaceId)}
                showSemester={false}
                {...cardsProps}
              />
            )}
          </CourseSection>
          {otherSemesters.map((s) => (
            <CourseSection
              key={s.entity.id}
              title={displayTitle(s.entity)}
              semester={s}
              spaceId={spaceId}
              courses={coursesFor(s.entity.id)}
            >
              {(course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  onOpen={() => openEntity(course.id, spaceId)}
                  showSemester={false}
                  {...cardsProps}
                />
              )}
            </CourseSection>
          ))}
          <CourseSection title="Unsorted" defaultOpen courses={coursesFor(null)}>
            {(course) => (
              <CourseCard
                key={course.id}
                course={course}
                onOpen={() => openEntity(course.id, spaceId)}
                showSemester={false}
                {...cardsProps}
              />
            )}
          </CourseSection>
        </div>
      )}

      <CreateCourseDialog open={createOpen} onOpenChange={setCreateOpen} spaceId={spaceId} />
    </div>
  );
}

/// One collapsible group in the Courses gallery, "Active", a past Semester, or
/// "Unsorted", headed by a wide bar like a Tasks list group. Skipped entirely
/// when empty, same convention `SemestersListView.tsx` uses for its own
/// "Unsorted" bucket.
function CourseSection({
  title,
  badge,
  semester,
  spaceId,
  courses,
  defaultOpen = false,
  children,
}: {
  title: string;
  badge?: string;
  /// When set, the bar shows its dates and a hover button jumps to its page.
  /// Omitted for "Unsorted", which has no Semester.
  semester?: Semester;
  spaceId?: string;
  courses: Entity[];
  defaultOpen?: boolean;
  children: (course: Entity) => React.ReactNode;
}) {
  const openEntity = useNavStore((s) => s.openEntity);
  const [open, setOpen] = useState(defaultOpen);
  if (courses.length === 0) return null;
  const dates =
    semester?.startDate && semester.endDate
      ? `${formatShortDate(semester.startDate)} to ${formatShortDate(semester.endDate)}`
      : null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section aria-label={title}>
        <div className="sticky top-0 z-10 bg-card">
          <div className="group/header flex h-9 items-center gap-2 rounded-md bg-foreground/4 px-2">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex h-7 min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-accent/60"
              >
                {open ? (
                  <IconCaretDownFilled size={10} className="text-muted-foreground" />
                ) : (
                  <IconCaretRightFilled size={10} className="text-muted-foreground" />
                )}
                {semester ? (
                  <IconCalendarWeek size={14} className="shrink-0 text-muted-foreground" />
                ) : (
                  <IconStack2 size={14} className="shrink-0 text-muted-foreground" />
                )}
                <span className="truncate font-medium">{title}</span>
                <span className="text-muted-foreground tabular-nums">{courses.length}</span>
              </button>
            </CollapsibleTrigger>
            {badge && (
              <Badge variant="primary" size="md">
                {badge}
              </Badge>
            )}
            {dates && (
              <span className="truncate text-xs text-muted-foreground tabular-nums max-sm:hidden">
                {dates}
              </span>
            )}
            {semester && spaceId && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Open ${title}`}
                    onClick={() => openEntity(semester.entity.id, spaceId)}
                    className="ml-auto flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover/header:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100"
                  >
                    <IconExternalLink size={14} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Open Semester</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
        <CollapsibleContent className="grid grid-cols-1 gap-3 pt-3 pb-2 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map(children)}
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

/// Exported so the Semester page's Course grid (`SemesterDetailView`) reuses
/// the exact same card rather than building a parallel design.
export function CourseCard({
  course,
  spaceId,
  sessions,
  exams,
  assignments,
  onOpen,
  showSemester = true,
}: {
  course: Entity;
  spaceId: string;
  sessions: SessionOccurrence[];
  exams: Exam[];
  assignments: Assignment[];
  onOpen: () => void;
  /// Off where the surrounding page already groups or scopes by Semester.
  showSemester?: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: relationships = [] } = useQuery({
    queryKey: ["relationships", course.id],
    queryFn: () => listRelationships(course.id, "both"),
  });

  // At most one, enforced at the data layer — a Course belongs to at most
  // one Semester at a time.
  const semesterLinks = relationships.filter(
    (r) => r.relationshipType === "course-semester" && r.fromEntityId === course.id,
  );
  const sequelLinks = relationships.filter(
    (r) => r.relationshipType === "sequel-of" || r.relationshipType === "prequel-of",
  );
  // `session-course`/`exam-course`/`assignment-course` all point course-ward
  // (the session/exam/assignment is `from`, the course is `to`) — the
  // opposite direction from `course-semester` above.
  const linkedIds = (relationshipType: string) =>
    new Set(
      relationships
        .filter((r) => r.relationshipType === relationshipType && r.toEntityId === course.id)
        .map((r) => r.fromEntityId),
    );
  const courseSessions = sessions.filter((s) => linkedIds("session-course").has(s.entity.id));
  const courseExams = exams.filter((e) => linkedIds("exam-course").has(e.entity.id));
  const courseAssignments = assignments.filter((a) =>
    linkedIds("assignment-course").has(a.entity.id),
  );

  const assignSemester = useMutation({
    mutationFn: (semesterId: string) => setCourseSemester(course.id, semesterId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["relationships", course.id] }),
  });

  return (
    <GalleryCard className="group" onClick={onOpen} {...entityTarget(course)}>
      <GalleryCardBanner
        color={gradientForName(displayTitle(course))}
        icon={<EntityIcon entity={course} size={22} className="text-black" />}
      />
      <GalleryCardBody>
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 truncate text-sm font-medium group-hover:underline">
            {displayTitle(course)}
          </span>
          <EntityKey entityKey={course.key} className="ml-auto" />
        </span>

        <CourseStats
          sessions={courseSessions}
          exams={courseExams}
          assignments={courseAssignments}
        />

        {((showSemester && semesterLinks.length > 0) || sequelLinks.length > 0) && (
          <div className="flex flex-wrap gap-1">
            {(showSemester ? semesterLinks : []).map((r) => (
              <RelatedChip
                key={r.id}
                entityId={r.toEntityId}
                icon={<IconCalendarStats size={11} />}
              />
            ))}
            {sequelLinks.map((r) => {
              const isFrom = r.fromEntityId === course.id;
              const otherId = isFrom ? r.toEntityId : r.fromEntityId;
              const label = isFrom ? "sequel of" : "prequel of";
              return (
                <RelatedChip
                  key={r.id}
                  entityId={otherId}
                  icon={<IconArrowRight size={11} />}
                  prefix={label}
                />
              );
            })}
          </div>
        )}

        {semesterLinks.length === 0 && (
          // The picker renders in a portal, but its clicks still bubble through
          // React to the card, which would open the Course. Stop them here.
          // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- only stops bubbling to the card
          <div
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className={cn(
              "transition-opacity group-hover:opacity-100",
              assignSemester.isIdle ? "opacity-0" : "opacity-100",
            )}
          >
            <EntityPickerPopover
              spaceId={spaceId}
              typeFilter="semester"
              exclude={course.id}
              trigger={
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 rounded-sm px-1 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <StatusIcon
                    status={statusOf(assignSemester)}
                    idle={<IconPlus size={11} />}
                    size={11}
                  />
                  <span className={statusTextClass(statusOf(assignSemester))}>
                    {assignSemester.isError ? "Couldn't link, try again" : "Link semester"}
                  </span>
                  <StatusAnnouncer
                    message={assignSemester.isError ? "Couldn't link semester" : null}
                  />
                </button>
              }
              onSelect={(semester) =>
                !assignSemester.isPending && assignSemester.mutate(semester.id)
              }
            />
          </div>
        )}
      </GalleryCardBody>
    </GalleryCard>
  );
}

/// The card's "what's next / how far along" row — real progress rings for
/// Assignments/Exams (reusing `ProgressCircle`, the same primitive the Task
/// subtask rollup uses) rather than bare counts, plus the next upcoming
/// Session as a date/time label. All three always render, even at zero —
/// an empty ring at 0/0 and "No sessions" scheduled are still information
/// (mirrors the Dashboard briefing's "every category always shows" rule in
/// `briefing-clauses.ts`), not something to hide.
function CourseStats({
  sessions,
  exams,
  assignments,
}: {
  sessions: SessionOccurrence[];
  exams: Exam[];
  assignments: Assignment[];
}) {
  const today = startOfDay(new Date());
  const nextSession = sessions
    .filter((s) => !s.cancelled && startOfDay(new Date(s.date)) >= today)
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))[0];

  const doneAssignments = assignments.filter((a) => DONE_ASSIGNMENT_STATUSES.has(a.status));
  const nextAssignmentDue = assignments
    .filter((a) => !DONE_ASSIGNMENT_STATUSES.has(a.status) && a.dueDate)
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))[0];

  const doneExams = exams.filter((e) => e.status === "done");
  const nextExam = exams
    .filter((e) => e.status !== "done" && e.examDate)
    .sort((a, b) => (a.examDate ?? "").localeCompare(b.examDate ?? ""))[0];

  return (
    <div className="flex select-none flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        <IconCalendar size={12} />
        {nextSession ? (
          <>
            Next {formatWeekday(nextSession.date, "short")} {formatClock(nextSession.startTime)}
          </>
        ) : (
          "No sessions"
        )}
      </span>
      <span className="flex items-center gap-1">
        <IconClipboardList size={12} />
        <ProgressCircle
          value={assignments.length > 0 ? (doneAssignments.length / assignments.length) * 100 : 0}
        />
        Assignments {doneAssignments.length}/{assignments.length}
        {nextAssignmentDue?.dueDate && ` · due ${dateLabel(nextAssignmentDue.dueDate)}`}
      </span>
      <span className="flex items-center gap-1">
        <IconWriting size={12} />
        <ProgressCircle value={exams.length > 0 ? (doneExams.length / exams.length) * 100 : 0} />
        Exams {doneExams.length}/{exams.length}
        {nextExam?.examDate && ` · next ${dateLabel(nextExam.examDate)}`}
      </span>
    </div>
  );
}

/// Fills out the empty-state grid so it reads as "your gallery, once it has
/// courses" rather than a blank box — ghost cards, not loading skeletons (no
/// pulse, no shimmer), so they don't imply data is on its way.
const PLACEHOLDER_COURSES: { titleWidth: string; stats: number; chips: number }[] = [
  { titleWidth: "w-2/3", stats: 2, chips: 2 },
  { titleWidth: "w-1/2", stats: 1, chips: 0 },
  { titleWidth: "w-3/4", stats: 0, chips: 1 },
  { titleWidth: "w-1/2", stats: 2, chips: 2 },
  { titleWidth: "w-3/5", stats: 1, chips: 1 },
];

/// The one real, interactive tile in the placeholder grid — same card shape as
/// `CourseCard`/`CoursePlaceholderCard` so it reads as part of the gallery
/// instead of a banner sitting on top of it. Its own banner stays muted
/// (there's no course id yet to derive a color from) and the border is
/// dashed to mark it as the "add" tile rather than content.
function CoursesEmptyCard({ onCreate }: { onCreate: () => void }) {
  return (
    <GalleryCard variant="dashed">
      <GalleryCardBanner
        color="var(--muted)"
        icon={<IconSchool size={20} className="text-muted-foreground/50" />}
      />
      <GalleryCardBody className="items-center text-center">
        <p className="text-sm font-medium text-foreground">No courses yet</p>
        <p className="text-xs text-muted-foreground">
          Add a course to start tracking its assignments and materials.
        </p>
        <Button size="sm" className="mt-1 gap-1.5" onClick={onCreate}>
          <IconPlus size={14} /> New course
        </Button>
      </GalleryCardBody>
    </GalleryCard>
  );
}

function CoursePlaceholderCard({
  titleWidth,
  stats,
  chips,
}: {
  titleWidth: string;
  stats: number;
  chips: number;
}) {
  return (
    <GalleryCard aria-hidden ghost>
      <GalleryCardBanner color="var(--muted-foreground)" />
      <GalleryCardBody>
        <div className="flex items-center gap-2">
          <div className="size-4 shrink-0 rounded-full bg-muted-foreground/30" />
          <div className={`h-3.5 ${titleWidth} rounded bg-muted-foreground/30`} />
        </div>
        {stats > 0 && (
          <div className="flex items-center gap-3">
            {Array.from({ length: stats }).map((_, i) => (
              <div key={i} className="flex items-center gap-1">
                <div className="size-3 shrink-0 rounded-full border-2 border-muted-foreground/30" />
                <div className="h-3 w-10 rounded bg-muted-foreground/20" />
              </div>
            ))}
          </div>
        )}
        {chips > 0 && (
          <div className="flex gap-1">
            {Array.from({ length: chips }).map((_, i) => (
              <div key={i} className="h-4 w-14 rounded-full bg-muted-foreground/20" />
            ))}
          </div>
        )}
      </GalleryCardBody>
    </GalleryCard>
  );
}

function RelatedChip({
  entityId,
  icon,
  prefix,
}: {
  entityId: string;
  icon: React.ReactNode;
  prefix?: string;
}) {
  const { data: entity } = useQuery({
    queryKey: ["entity", entityId],
    queryFn: () => getEntity(entityId),
  });
  if (!entity) return null;
  return (
    <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      {icon}
      <span className="truncate">
        {prefix ? `${prefix} ` : ""}
        {displayTitle(entity)}
      </span>
    </span>
  );
}

function CreateCourseDialog({
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
  const inputRef = useRef<HTMLInputElement>(null);

  const create = useMutation({
    mutationFn: () => createCourse(spaceId, title.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses", spaceId] });
      queryClient.invalidateQueries({ queryKey: ["entities", spaceId] });
    },
  });
  const { reset } = create;
  useCloseAfterSuccess(create, () => {
    onOpenChange(false);
    if (create.data) openEntity(create.data.id, spaceId);
  });

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else {
      setTitle("");
      reset();
    }
  }, [open, reset]);

  const submit = () => {
    if (title.trim() && !create.isPending && !create.isSuccess) create.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New course</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Input
            ref={inputRef}
            placeholder="Course name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
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
