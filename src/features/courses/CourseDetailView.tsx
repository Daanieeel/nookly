import {
  IconArrowRight,
  IconCalendarStats,
  IconCards,
  IconClipboardList,
  IconWriting,
  type Icon as TablerIcon,
} from "@tabler/icons-react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays, format, startOfDay } from "date-fns";
import { EntityDetailLayout } from "@/components/entity-detail-layout";
import { entityTarget } from "@/components/context-menu/registry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InteractiveCard } from "@/components/ui/interactive-card";
import { EmptyState } from "@/components/empty-state";
import { listAssignments } from "@/lib/api/assignments";
import { getCourseNotes } from "@/lib/api/courses";
import { listDecks, listDueCards } from "@/lib/api/decks";
import { listExams } from "@/lib/api/exams";
import { listRelationships } from "@/lib/api/relationships";
import { listSessions } from "@/lib/api/sessions";
import type { Entity } from "@/lib/api/types";
import { displayTitle } from "@/lib/entity-title";
import { BlockEditor } from "@/features/notes/BlockEditor";
import { useNavStore } from "@/lib/store/nav";

const DONE_ASSIGNMENT_STATUSES = new Set(["submitted", "graded"]);

/// Copied rather than imported from `CoursesListView` (same convention that
/// file itself uses for its own copied helpers) — these are small, presentation
/// -specific date formatters, not shared domain logic.
function dateLabel(date: string): string {
  const days = differenceInCalendarDays(new Date(date), new Date());
  return days <= 7 ? `${Math.max(days, 0)}d` : format(new Date(date), "MMM d");
}

function formatSessionTime(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const hour = Number(hStr);
  const minute = Number(mStr ?? "0");
  const period = hour >= 12 ? "pm" : "am";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return minute === 0
    ? `${hour12}${period}`
    : `${hour12}:${String(minute).padStart(2, "0")}${period}`;
}

/// Course detail body (§ course sub-dashboard plan) — header, right sidebar
/// (Relationships incl. Semester/sequel-prequel, Attachments, Mentioned) all
/// come free from `EntityDetailLayout`, exactly like every other entity type.
/// Only the body — Course Notes, the bento quick-access grid, and the
/// scrollable Sessions/Exams/Assignments sections — is Course-specific.
export function CourseDetailView({ entity }: { entity: Entity }) {
  return (
    <EntityDetailLayout entity={entity}>
      <CourseBody course={entity} />
    </EntityDetailLayout>
  );
}

function CourseBody({ course }: { course: Entity }) {
  const openEntity = useNavStore((s) => s.openEntity);
  const setView = useNavStore((s) => s.setView);
  const spaceId = course.spaceId;

  const { data: notesEntity } = useQuery({
    queryKey: ["course-notes", course.id],
    queryFn: () => getCourseNotes(course.id),
  });
  const { data: relationships = [] } = useQuery({
    queryKey: ["relationships", course.id],
    queryFn: () => listRelationships(course.id, "both"),
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
  const { data: decks = [] } = useQuery({
    queryKey: ["decks", spaceId],
    queryFn: () => listDecks(spaceId),
  });

  // `session-course`/`exam-course`/`assignment-course` all point course-ward
  // (the session/exam/assignment is `from`, the course is `to`) — same
  // direction convention `CoursesListView`'s `CourseCard` reads.
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

  // Decks are only indirectly scoped to a Course (Deck -> Exam -> Course), so
  // finding them needs one more hop: which decks point (`deck-exam`) at one of
  // this course's Exams. `deck-exam` isn't in `relationships` above (that only
  // covers edges touching the Course itself), so each Exam's own relationships
  // are fetched separately.
  const examRelQueries = useQueries({
    queries: courseExams.map((exam) => ({
      queryKey: ["relationships", exam.entity.id],
      queryFn: () => listRelationships(exam.entity.id, "to"),
    })),
  });
  const courseDeckIds = examRelQueries.flatMap((q) =>
    (q.data ?? []).filter((r) => r.relationshipType === "deck-exam").map((r) => r.fromEntityId),
  );
  const courseDecks = decks.filter((d) => courseDeckIds.includes(d.id));
  const dueCardQueries = useQueries({
    queries: courseDecks.map((deck) => ({
      queryKey: ["due-cards", deck.id],
      queryFn: () => listDueCards(deck.id),
    })),
  });
  const totalDue = dueCardQueries.reduce((sum, q) => sum + (q.data?.length ?? 0), 0);

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
            ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
            : "grid grid-cols-1 gap-3 sm:grid-cols-3"
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
                {format(new Date(nextSession.date), "EEEE")}{" "}
                {formatSessionTime(nextSession.startTime)}
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

        {courseDecks.length > 0 && (
          <BentoCard icon={IconCards} label="Study Progress" onClick={() => viewAll("exams")}>
            <p className="text-sm font-medium">{totalDue} cards due</p>
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
              meta={`${format(new Date(s.date), "EEE MMM d")} · ${formatSessionTime(s.startTime)}`}
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
