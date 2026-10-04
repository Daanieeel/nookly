import {
  IconArrowRight,
  IconCalendarStats,
  IconChartBar,
  IconCards,
  IconClipboardList,
  IconWriting,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useCourseRelationships,
  useSpaceAssignments,
  useSpaceExams,
  useSpaceSessions,
  courseLinkedItems,
} from "#/features/courses/course-queries.ts";
import { differenceInCalendarDays, startOfDay } from "date-fns";
import { EntityDetailLayout } from "#/components/entity-detail-layout.tsx";
import { TextProperty } from "#/components/property-fields.tsx";
import { PropertyRow } from "#/components/property-row.tsx";
import { entityTarget } from "#/components/context-menu/registry.ts";
import { Badge } from "@nookly/ui/components/badge";
import { Button } from "@nookly/ui/components/button";
import { CardContent, CardHeader, CardTitle } from "@nookly/ui/components/card";
import { InteractiveCard } from "@nookly/ui/components/interactive-card";
import { EmptyState } from "#/components/empty-state.tsx";
import {
  getCourseDetails,
  getCourseGrades,
  getCourseNotes,
  updateCourseProfessor,
} from "#/lib/api/courses.ts";
import { getDeckStats, listDecks } from "#/lib/api/decks.ts";
import { listRelationships } from "#/lib/api/relationships.ts";
import type { Entity } from "#/lib/api/types.ts";
import { displayTitle } from "#/lib/entity-title.ts";
import { BlockEditor } from "#/features/notes/BlockEditor.tsx";
import { useNavStore } from "#/lib/store/nav.ts";
import { formatClock, formatShortDate, formatWeekday } from "#/lib/datetime.ts";
import { qk } from "#/lib/query-keys.ts";

const DONE_ASSIGNMENT_STATUSES = new Set(["submitted", "graded"]);

/// Copied rather than imported from `CoursesListView` (same convention that
/// file itself uses for its own copied helpers) — these are small, presentation
/// -specific date formatters, not shared domain logic.
function dateLabel(date: string): string {
  const days = differenceInCalendarDays(new Date(date), new Date());
  return days <= 7 ? `${Math.max(days, 0)}d` : formatShortDate(date);
}

/// Up to two decimals, so a 1.7 stays 1.7 and a 1.5333 becomes 1.53.
function formatGrade(grade: number): string {
  return String(Math.round(grade * 100) / 100);
}

/// Course detail body (§ course sub-dashboard plan) — header, right sidebar
/// (Relationships incl. Semester/sequel-prequel, Attachments, Mentioned) all
/// come free from `EntityDetailLayout`, exactly like every other entity type.
/// Only the body — Course Notes, the bento quick-access grid, and the
/// scrollable Sessions/Exams/Assignments sections — is Course-specific.
export function CourseDetailView({ entity }: { entity: Entity }) {
  return (
    <EntityDetailLayout entity={entity} sidebar={<PropertiesPanel course={entity} />}>
      <CourseBody course={entity} />
    </EntityDetailLayout>
  );
}

/// Saves one course detail and refreshes the details it's read from.
function useCourseDetailSave(
  course: Entity,
  write: (id: string, value: string | null) => Promise<void>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: string | null) => write(course.id, value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.courses.details(course.id) }),
  });
}

/// Professor, as a text property at the top of the right sidebar.
function PropertiesPanel({ course }: { course: Entity }) {
  const { data: details } = useQuery({
    queryKey: qk.courses.details(course.id),
    queryFn: () => getCourseDetails(course.id),
  });
  const setProfessor = useCourseDetailSave(course, updateCourseProfessor);

  if (!details) return null;
  return (
    <section aria-label="Properties" className="flex flex-col gap-0.5">
      <PropertyRow label="Professor">
        <TextProperty
          value={details.professor}
          onSave={(professor) => setProfessor.mutate(professor)}
          placeholder="Add professor"
          label="Professor"
          pending={setProfessor.isPending}
          failed={setProfessor.isError}
        />
      </PropertyRow>
    </section>
  );
}

function CourseBody({ course }: { course: Entity }) {
  const openEntity = useNavStore((s) => s.openEntity);
  const setView = useNavStore((s) => s.setView);
  const spaceId = course.spaceId;

  const { data: notesEntity } = useQuery({
    queryKey: qk.courses.notes(course.id),
    queryFn: () => getCourseNotes(course.id),
  });
  const { data: relationships = [], dataUpdatedAt: relationshipsUpdatedAt } =
    useCourseRelationships(course.id);
  const { data: sessions = [] } = useSpaceSessions(spaceId);
  const { data: exams = [], dataUpdatedAt: examsUpdatedAt } = useSpaceExams(spaceId);
  const { data: assignments = [], dataUpdatedAt: assignmentsUpdatedAt } =
    useSpaceAssignments(spaceId);
  // Keyed on when the lists it's computed from last loaded, so editing a grade,
  // weight or course link anywhere refreshes it without its own invalidation.
  const { data: grades } = useQuery({
    queryKey: qk.courses.grades(
      course.id,
      examsUpdatedAt,
      assignmentsUpdatedAt,
      relationshipsUpdatedAt,
    ),
    queryFn: () => getCourseGrades(course.id),
    placeholderData: (previous) => previous,
  });
  const { data: decks = [] } = useQuery({
    queryKey: qk.decks.bySpace(spaceId),
    queryFn: () => listDecks(spaceId),
  });

  const { courseSessions, courseExams, courseAssignments } = courseLinkedItems(
    relationships,
    course.id,
    { sessions, exams, assignments },
  );

  // Decks are only indirectly scoped to a Course (Deck -> Exam -> Course), so
  // finding them needs one more hop: which decks point (`deck-exam`) at one of
  // this course's Exams. `deck-exam` isn't in `relationships` above (that only
  // covers edges touching the Course itself), so each Exam's own relationships
  // are fetched separately.
  const examRelQueries = useQueries({
    queries: courseExams.map((exam) => ({
      queryKey: qk.relationships.of(exam.entity.id),
      queryFn: () => listRelationships(exam.entity.id, "to"),
    })),
  });
  const courseDeckIds = examRelQueries.flatMap((q) =>
    (q.data ?? []).filter((r) => r.relationshipType === "deck-exam").map((r) => r.fromEntityId),
  );
  const courseDecks = decks.filter((d) => courseDeckIds.includes(d.id));
  const deckStatsQueries = useQueries({
    queries: courseDecks.map((deck) => ({
      queryKey: qk.decks.stats(deck.id),
      queryFn: () => getDeckStats(deck.id),
    })),
  });
  const totalDue = deckStatsQueries.reduce(
    (sum, q) => sum + (q.data ? q.data.new + q.data.learning + q.data.due : 0),
    0,
  );

  const today = startOfDay(new Date());
  const nextSession = [...courseSessions]
    .filter((s) => !s.cancelled && startOfDay(new Date(s.date)) >= today)
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))[0];
  const nextExam = [...courseExams]
    .filter((e) => e.status !== "done" && e.examDate)
    .sort((a, b) => (a.examDate ?? "").localeCompare(b.examDate ?? ""))[0];
  const openAssignments = courseAssignments.filter((a) => !DONE_ASSIGNMENT_STATUSES.has(a.status));
  const nextAssignmentDue = [...openAssignments]
    .filter((a) => a.dueDate)
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))[0];

  const viewAll = (module: "sessions" | "exams" | "assignments") =>
    setView({ kind: "module", spaceId, module, filterCourseId: course.id });

  return (
    <div className="flex w-full flex-col gap-6">
      {notesEntity ? (
        <BlockEditor entityId={notesEntity.id} spaceId={spaceId} compact />
      ) : (
        <p className="text-sm text-muted-foreground">Loading notes…</p>
      )}

      <div
        className={
          courseDecks.length > 0
            ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
            : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        }
      >
        <BentoCard
          icon={IconCalendarStats}
          label="Next Session"
          onClick={nextSession ? () => openEntity(nextSession.entity.id, spaceId) : undefined}
        >
          {nextSession ? (
            <>
              <p className="text-sm font-medium">
                {formatWeekday(nextSession.date)} {formatClock(nextSession.startTime)}
              </p>
              <p className="text-xs text-muted-foreground">in {dateLabel(nextSession.date)}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No sessions scheduled</p>
          )}
        </BentoCard>

        <BentoCard
          icon={IconWriting}
          label="Next Exam"
          onClick={nextExam ? () => openEntity(nextExam.entity.id, spaceId) : undefined}
        >
          {nextExam ? (
            <>
              <p className="truncate text-sm font-medium">{displayTitle(nextExam.entity)}</p>
              <p className="text-xs text-muted-foreground">
                {nextExam.examDate ? dateLabel(nextExam.examDate) : "No date set"}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No exams scheduled</p>
          )}
        </BentoCard>

        <BentoCard
          icon={IconClipboardList}
          label="Open Assignments"
          onClick={() => viewAll("assignments")}
        >
          <p className="text-sm font-medium">
            {openAssignments.length} open{" "}
            <span className="font-normal text-muted-foreground">
              / {courseAssignments.length} total
            </span>
          </p>
          {nextAssignmentDue?.dueDate && (
            <p className="text-xs text-muted-foreground">
              due {dateLabel(nextAssignmentDue.dueDate)}
            </p>
          )}
        </BentoCard>

        <BentoCard icon={IconChartBar} label="Course Grade">
          {grades?.grade != null ? (
            <>
              <p className="text-sm font-medium tabular-nums">{formatGrade(grades.grade)}</p>
              <p className="text-xs text-muted-foreground">
                {Math.round(grades.gradedWeight * 100)}% of the course graded
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No grades yet</p>
          )}
        </BentoCard>

        {courseDecks.length > 0 && (
          <BentoCard icon={IconCards} label="Study Progress" onClick={() => viewAll("exams")}>
            <p className="text-sm font-medium">{totalDue} cards to study</p>
            <p className="text-xs text-muted-foreground">
              across {courseDecks.length} deck{courseDecks.length === 1 ? "" : "s"}
            </p>
          </BentoCard>
        )}
      </div>

      <CourseSection
        title="Sessions"
        onViewAll={() => viewAll("sessions")}
        empty={courseSessions.length === 0}
        emptyIcon={IconCalendarStats}
        emptyLabel="No sessions yet"
      >
        {[...courseSessions]
          .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
          .slice(0, 5)
          .map((s) => (
            <SectionRow
              key={s.entity.id}
              entity={s.entity}
              title={displayTitle(s.entity)}
              meta={`${formatWeekday(s.date, "short")} ${formatShortDate(s.date)} · ${formatClock(s.startTime)}`}
              onClick={() => openEntity(s.entity.id, spaceId)}
            />
          ))}
      </CourseSection>

      <CourseSection
        title="Exams"
        onViewAll={() => viewAll("exams")}
        empty={courseExams.length === 0}
        emptyIcon={IconWriting}
        emptyLabel="No exams yet"
      >
        {[...courseExams]
          .sort((a, b) => (a.examDate ?? "").localeCompare(b.examDate ?? ""))
          .map((e) => (
            <SectionRow
              key={e.entity.id}
              entity={e.entity}
              title={displayTitle(e.entity)}
              meta={e.examDate ?? undefined}
              badge={e.status}
              onClick={() => openEntity(e.entity.id, spaceId)}
            />
          ))}
      </CourseSection>

      <CourseSection
        title="Assignments"
        onViewAll={() => viewAll("assignments")}
        empty={courseAssignments.length === 0}
        emptyIcon={IconClipboardList}
        emptyLabel="No assignments yet"
      >
        {[...courseAssignments]
          .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
          .map((a) => (
            <SectionRow
              key={a.entity.id}
              entity={a.entity}
              title={displayTitle(a.entity)}
              meta={a.dueDate ?? undefined}
              badge={a.status}
              onClick={() => openEntity(a.entity.id, spaceId)}
            />
          ))}
      </CourseSection>
    </div>
  );
}

/// A bento tile built on `InteractiveCard`/`CardHeader`/`CardTitle`/`CardContent`
/// (same primitives `DashboardView` composes for its own bento grid) — kept
/// local since this shape (icon+label header, free-form small body) is
/// specific to this quick-access grid, not a general-purpose primitive.
function BentoCard({
  icon: Icon,
  label,
  onClick,
  children,
}: {
  icon: TablerIcon;
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <InteractiveCard onClick={onClick}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Icon size={15} className="text-muted-foreground" /> {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-0.5 pb-4">{children}</CardContent>
    </InteractiveCard>
  );
}

function CourseSection({
  title,
  onViewAll,
  empty,
  emptyIcon,
  emptyLabel,
  children,
}: {
  title: string;
  onViewAll: () => void;
  empty: boolean;
  emptyIcon: TablerIcon;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={onViewAll}>
          View all <IconArrowRight size={12} />
        </Button>
      </div>
      {empty ? (
        <EmptyState icon={emptyIcon} title={emptyLabel} compact />
      ) : (
        <div className="flex flex-col rounded-lg border border-border">{children}</div>
      )}
    </div>
  );
}

function SectionRow({
  entity,
  title,
  meta,
  badge,
  onClick,
}: {
  /// What the row stands for, so a right-click opens that entity's menu.
  entity: Entity;
  title: string;
  meta?: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...entityTarget(entity)}
      className="flex items-center gap-2.5 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent"
    >
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {meta && <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>}
      {badge && (
        <Badge variant="outline" className="shrink-0">
          {badge}
        </Badge>
      )}
    </button>
  );
}
