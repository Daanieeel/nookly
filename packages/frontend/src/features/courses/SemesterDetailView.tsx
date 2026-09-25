import {
  IconBook2,
  IconCalendarStats,
  IconClipboardList,
  IconPlus,
  IconWriting,
} from "@tabler/icons-react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { endOfWeek, startOfDay, startOfWeek } from "date-fns";
import { useEffect, useRef, useState } from "react";
import {
  StatusAnnouncer,
  StatusButtonContent,
  StatusIcon,
  statusOf,
  statusTextClass,
  useCloseAfterSuccess,
} from "#/components/action-feedback.tsx";
import { EntityDetailLayout } from "#/components/entity-detail-layout.tsx";
import { EntityIcon } from "#/components/entity-icon.tsx";
import { Badge } from "@nookly/ui/components/badge";
import { Button } from "@nookly/ui/components/button";
import { Card, CardContent } from "@nookly/ui/components/card";
import { Input } from "@nookly/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@nookly/ui/components/popover";
import { Separator } from "@nookly/ui/components/separator";
import { listAssignments } from "#/lib/api/assignments.ts";
import {
  createCourse,
  getSemesterNotes,
  listCourses,
  listSemesters,
  setCourseSemester,
} from "#/lib/api/courses.ts";
import { listExams } from "#/lib/api/exams.ts";
import { listRelationships } from "#/lib/api/relationships.ts";
import { listSessions } from "#/lib/api/sessions.ts";
import type { Entity } from "#/lib/api/types.ts";
import { BlockEditor } from "#/features/notes/BlockEditor.tsx";
import { displayTitle } from "#/lib/entity-title.ts";
import { useNavStore } from "#/lib/store/nav.ts";
import { cn } from "@nookly/ui/lib/utils";
import { resolveActiveSemesterId } from "./current-semester";
import { CourseCard } from "./CoursesListView";

const DONE_ASSIGNMENT_STATUSES = new Set(["submitted", "graded"]);
/// Same 7-day window `dateLabel` elsewhere in Courses UI (`CoursesListView`/
/// `CourseDetailView`) treats as "soon" — reused here as the Aggregate Stats
/// Strip's upcoming-exams lookahead so the two pages agree on what "upcoming"
/// means.
const EXAM_LOOKAHEAD_DAYS = 7;

/// Semester detail body (PLAN §2-5) — header (icon/title/"Current" badge),
/// inline Semester Notes, an Aggregate Stats Strip rolled up across every
/// linked Course, then the Course grid. Right sidebar (Relationships incl.
/// Courses, Attachments, Mentioned) comes free from `EntityDetailLayout`,
/// same as every other entity type.
export function SemesterDetailView({ entity }: { entity: Entity }) {
  const spaceId = entity.spaceId;
  const { data: semesters = [] } = useQuery({
    queryKey: ["semesters", spaceId],
    queryFn: () => listSemesters(spaceId),
  });
  const isCurrent = resolveActiveSemesterId(semesters) === entity.id;

  return (
    <EntityDetailLayout
      entity={entity}
      headerExtra={isCurrent ? <Badge variant="default">Current</Badge> : undefined}
    >
      <SemesterBody semester={entity} />
    </EntityDetailLayout>
  );
}

function SemesterBody({ semester }: { semester: Entity }) {
  const spaceId = semester.spaceId;
  const openEntity = useNavStore((s) => s.openEntity);

  const { data: notesEntity } = useQuery({
    queryKey: ["semester-notes", semester.id],
    queryFn: () => getSemesterNotes(semester.id),
  });
  const { data: allCourses = [] } = useQuery({
    queryKey: ["courses", spaceId],
    queryFn: () => listCourses(spaceId),
  });
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

  // Same `queryKey` shape `CoursesListView` uses per-course — react-query
  // shares the cache. Fetched for every Course in the Space (not just this
  // Semester's) so the "Add course" picker (§4) can tell which Courses are
  // globally unassigned — a Course belongs to at most one Semester at a time.
  const courseRelQueries = useQueries({
    queries: allCourses.map((course) => ({
      queryKey: ["relationships", course.id],
      queryFn: () => listRelationships(course.id, "both"),
    })),
  });
  const semesterIdByCourse = new Map<string, string>();
  allCourses.forEach((course, i) => {
    const link = (courseRelQueries[i]?.data ?? []).find(
      (r) => r.relationshipType === "course-semester" && r.fromEntityId === course.id,
    );
    if (link) semesterIdByCourse.set(course.id, link.toEntityId);
  });
  const courses = allCourses.filter((c) => semesterIdByCourse.get(c.id) === semester.id);
  const unassignedCourses = allCourses.filter((c) => !semesterIdByCourse.has(c.id));
  const courseIds = new Set(courses.map((c) => c.id));

  // Two-hop rollup (Semester -> Courses -> each Course's Sessions/Exams/
  // Assignments, PLAN §3).
  const linkedToAnyCourse = (relationshipType: string) => {
    const ids = new Set<string>();
    allCourses.forEach((course, i) => {
      if (!courseIds.has(course.id)) return;
      (courseRelQueries[i]?.data ?? [])
        .filter((r) => r.relationshipType === relationshipType && r.toEntityId === course.id)
        .forEach((r) => ids.add(r.fromEntityId));
    });
    return ids;
  };
  const semesterSessions = sessions.filter((s) =>
    linkedToAnyCourse("session-course").has(s.entity.id),
  );
  const semesterExams = exams.filter((e) => linkedToAnyCourse("exam-course").has(e.entity.id));
  const semesterAssignments = assignments.filter((a) =>
    linkedToAnyCourse("assignment-course").has(a.entity.id),
  );

  const today = startOfDay(new Date());
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const sessionsThisWeek = semesterSessions.filter((s) => {
    if (s.cancelled) return false;
    const date = startOfDay(new Date(s.date));
    return date >= weekStart && date <= weekEnd;
  }).length;

  const lookaheadEnd = new Date(today);
  lookaheadEnd.setDate(lookaheadEnd.getDate() + EXAM_LOOKAHEAD_DAYS);
  const upcomingExams = semesterExams.filter((e) => {
    if (e.status === "done" || !e.examDate) return false;
    const date = startOfDay(new Date(e.examDate));
    return date >= today && date <= lookaheadEnd;
  }).length;

  const openAssignments = semesterAssignments.filter(
    (a) => !DONE_ASSIGNMENT_STATUSES.has(a.status),
  ).length;

  return (
    <div className="flex w-full flex-col gap-6">
      {notesEntity ? (
        <BlockEditor entityId={notesEntity.id} spaceId={spaceId} compact />
      ) : (
        <p className="text-sm text-muted-foreground">Loading notes…</p>
      )}

      <StatsStrip
        sessionsThisWeek={sessionsThisWeek}
        upcomingExams={upcomingExams}
        openAssignments={openAssignments}
      />

      <div className="flex flex-col gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <IconBook2 size={15} className="text-muted-foreground" /> Courses
        </h2>

        {/* `@container` so the grid responds to the space actually available
            to it (this pane, next to the right sidebar) rather than the full
            viewport — shrinks to 2 columns, then 1, well before the window
            itself would trip a viewport breakpoint. */}
        <div className="@container">
          <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2 @2xl:grid-cols-3">
            {courses.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                spaceId={spaceId}
                sessions={sessions}
                exams={exams}
                assignments={assignments}
                onOpen={() => openEntity(course.id, spaceId)}
                showSemester={false}
              />
            ))}
            <AddCourseCard
              spaceId={spaceId}
              semesterId={semester.id}
              unassignedCourses={unassignedCourses}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/// Compact horizontal summary (PLAN §3) — deliberately lighter than the
/// Course page's bento grid, so the two "rollup" pages stay visually
/// distinct in weight rather than duplicating the same widget language.
function StatsStrip({
  sessionsThisWeek,
  upcomingExams,
  openAssignments,
}: {
  sessionsThisWeek: number;
  upcomingExams: number;
  openAssignments: number;
}) {
  return (
    <Card className="w-full">
      <CardContent className="flex w-full items-center justify-evenly gap-4 py-4">
        <StatItem icon={IconCalendarStats} value={sessionsThisWeek} label="sessions this week" />
        <Separator orientation="vertical" className="h-6" />
        <StatItem icon={IconWriting} value={upcomingExams} label="upcoming exams" />
        <Separator orientation="vertical" className="h-6" />
        <StatItem icon={IconClipboardList} value={openAssignments} label="open assignments" />
      </CardContent>
    </Card>
  );
}

function StatItem({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof IconCalendarStats;
  value: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <Icon size={14} className="text-muted-foreground" />
      <span className="font-medium">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

/// Ghost "+" tile — a plain dashed-border card, not a full `CourseCard`-style
/// tile, since it's an action rather than a Course — opening a small popover
/// with the two ways to grow a Semester's Course grid: link an existing
/// Course, or create a new one pre-linked to it.
function AddCourseCard({
  spaceId,
  semesterId,
  unassignedCourses,
}: {
  spaceId: string;
  semesterId: string;
  unassignedCourses: Entity[];
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const create = useMutation({
    mutationFn: async () => {
      const course = await createCourse(spaceId, title.trim());
      await setCourseSemester(course.id, semesterId);
      return course;
    },
    onSuccess: (course) => {
      queryClient.invalidateQueries({ queryKey: ["courses", spaceId] });
      return queryClient.invalidateQueries({ queryKey: ["relationships", course.id] });
    },
  });
  const link = useMutation({
    mutationFn: (courseId: string) => setCourseSemester(courseId, semesterId),
    onSuccess: (_, courseId) =>
      queryClient.invalidateQueries({ queryKey: ["relationships", courseId] }),
  });
  const close = () => setOpen(false);
  useCloseAfterSuccess(create, close);
  useCloseAfterSuccess(link, close);
  const busy = create.isPending || link.isPending || create.isSuccess || link.isSuccess;
  const resetCreate = create.reset;
  const resetLink = link.reset;

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else {
      setTitle("");
      resetCreate();
      resetLink();
    }
  }, [open, resetCreate, resetLink]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-4 text-center">
        <p className="text-sm font-medium text-foreground">Add course</p>
        <PopoverTrigger asChild>
          <Button variant="secondary" size="sm" className="gap-1.5">
            <IconPlus size={14} /> Add
          </Button>
        </PopoverTrigger>
      </div>
      <PopoverContent className="w-64 p-1" align="start">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim() && !busy) create.mutate();
          }}
          className="flex flex-col gap-2"
        >
          <Input
            ref={inputRef}
            placeholder="New course name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-8 text-sm"
          />
          <Button type="submit" size="sm" disabled={!title.trim()}>
            <StatusButtonContent
              status={statusOf(create)}
              label="Create & link"
              successLabel="Created and linked"
              errorLabel="Couldn't create, try again"
            />
          </Button>
        </form>
        <div className="my-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Separator className="flex-1" /> or <Separator className="flex-1" />
        </div>
        {unassignedCourses.length === 0 ? (
          <p className="px-2 py-1 text-xs text-muted-foreground">No other courses in this Space.</p>
        ) : (
          <>
            <div className="flex max-h-[104px] flex-col gap-0.5 overflow-y-auto">
              {unassignedCourses.map((course) => {
                const status = link.variables === course.id ? statusOf(link) : "idle";
                return (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => !busy && link.mutate(course.id)}
                    className="flex h-8 shrink-0 items-center gap-1.5 rounded-sm px-2 text-left text-sm hover:bg-accent"
                  >
                    <StatusIcon
                      status={status}
                      idle={
                        <EntityIcon
                          entity={course}
                          size={14}
                          className="shrink-0 text-muted-foreground"
                        />
                      }
                    />
                    <span className={cn("truncate", statusTextClass(status))}>
                      {status === "error" ? "Couldn't link, try again" : displayTitle(course)}
                    </span>
                  </button>
                );
              })}
            </div>
            <StatusAnnouncer
              message={
                link.isSuccess ? "Course linked" : link.isError ? "Couldn't link course" : null
              }
            />
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
