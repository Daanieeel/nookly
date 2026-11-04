import { IconCalendarOff, IconChevronRight, IconClipboardList } from "@tabler/icons-react";
import type { MouseEvent } from "react";
import { Badge } from "@nookly/ui/components/badge";
import { cn } from "@nookly/ui/lib/utils";
import type { MoodleAssignment } from "#/lib/api/moodle.ts";
import { MoodleFrame, useMoodleNavigate } from "./MoodleFrame.tsx";
import { MoodleData, MoodleEmpty } from "./MoodleStates.tsx";
import { MoodleFiles } from "./MoodleFiles.tsx";
import { MoodleHtml } from "./MoodleHtml.tsx";
import { useCourseName } from "./CoursePage.tsx";
import {
  type DueTone,
  dueTone,
  gradingLabel,
  moodleDate,
  submissionLabel,
} from "./moodle-format.ts";
import { SAMPLE_ASSIGNMENTS } from "./moodle-samples.ts";
import { hasMoodleText } from "./moodle-html.ts";
import { assignmentPath, coursePath, moodleWebUrl } from "./moodle-path.ts";
import {
  useMoodleAssignmentStatus,
  useMoodleAssignments,
  useMoodleCourse,
} from "./moodle-queries.ts";

/// Due soonest first; those without a due date last.
export function sortAssignments(items: MoodleAssignment[]): MoodleAssignment[] {
  const key = (a: MoodleAssignment) => (a.dueDate > 0 ? a.dueDate : Number.MAX_SAFE_INTEGER);
  return [...items].sort((a, b) => key(a) - key(b) || a.name.localeCompare(b.name));
}

export function CourseAssignments({ spaceId, courseId }: { spaceId: string; courseId: number }) {
  const query = useMoodleAssignments(courseId);
  const go = useMoodleNavigate(spaceId);
  return (
    <MoodleData
      query={query}
      sample={SAMPLE_ASSIGNMENTS}
      label="Loading the assignments"
      empty={(items) =>
        items.length === 0 ? (
          <MoodleEmpty
            icon={IconClipboardList}
            title="No assignments"
            description="Assignments your teachers set in this course show up here."
          />
        ) : null
      }
    >
      {(items) => (
        <ul className="flex flex-col gap-3">
          {sortAssignments(items).map((assignment) => (
            <li key={assignment.id}>
              <AssignmentCard
                assignment={assignment}
                onOpen={(e) => go(assignmentPath(courseId, assignment.id), e)}
              />
            </li>
          ))}
        </ul>
      )}
    </MoodleData>
  );
}

const TONES = {
  none: { tile: "bg-muted text-muted-foreground", badge: null },
  later: { tile: "bg-accent-blue/10 text-accent-blue", badge: null },
  soon: { tile: "bg-caution/10 text-caution", badge: "Due soon" },
  overdue: { tile: "bg-destructive/10 text-destructive", badge: "Overdue" },
} satisfies Record<DueTone, { tile: string; badge: string | null }>;

function AssignmentCard({
  assignment,
  onOpen,
}: {
  assignment: MoodleAssignment;
  onOpen: (event: MouseEvent) => void;
}) {
  const tone = TONES[dueTone(assignment.dueDate)];
  const due = assignment.dueDate > 0 ? new Date(assignment.dueDate * 1000) : null;
  return (
    <button
      type="button"
      className="group flex w-full items-center gap-4 rounded-2xl border border-border bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onOpen}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-14 shrink-0 flex-col items-center justify-center rounded-xl leading-none",
          tone.tile,
        )}
      >
        {due ? (
          <>
            <span className="text-xs font-semibold uppercase">
              {due.toLocaleString(undefined, { month: "short" })}
            </span>
            <span className="mt-1 text-lg font-semibold tabular-nums">{due.getDate()}</span>
          </>
        ) : (
          <IconCalendarOff size={20} />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm font-semibold">{assignment.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {moodleDate(assignment.dueDate) ? `Due ${moodleDate(assignment.dueDate)}` : "No due date"}
        </span>
      </span>
      {tone.badge && <Badge variant="secondary">{tone.badge}</Badge>}
      <IconChevronRight
        size={16}
        aria-hidden="true"
        className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
      />
    </button>
  );
}

export function AssignmentPage({
  spaceId,
  siteUrl,
  courseId,
  assignmentId,
}: {
  spaceId: string;
  siteUrl: string;
  courseId: number;
  assignmentId: number;
}) {
  const assignments = useMoodleAssignments(courseId);
  const status = useMoodleAssignmentStatus(assignmentId);
  const courseName = useCourseName(courseId);
  const { data: course } = useMoodleCourse(courseId);
  const assignment = assignments.data?.data.find((a) => a.id === assignmentId);
  const state = status.data?.data;
  const graded = gradingLabel(state?.gradingStatus);
  return (
    <MoodleFrame
      spaceId={spaceId}
      title={assignment?.name ?? "Assignment"}
      crumbs={[
        { label: "Moodle", path: "" },
        { label: courseName, path: coursePath(courseId, "assignments") },
      ]}
      webUrl={moodleWebUrl(
        siteUrl,
        { page: "assignment", courseId, assignmentId },
        assignment?.cmid,
      )}
      fetchedAt={assignments.data?.fetchedAt}
      offline={assignments.data?.offline}
      course={course ?? { id: courseId, overviewFiles: [] }}
    >
      <MoodleData
        query={assignments}
        sample={SAMPLE_ASSIGNMENTS}
        label="Loading the assignment"
        empty={(items) =>
          items.some((a) => a.id === assignmentId) ? null : (
            <MoodleEmpty
              icon={IconClipboardList}
              title="This assignment is gone"
              description="Moodle no longer lists it in this course."
            />
          )
        }
      >
        {(items) => {
          const shown = items.find((a) => a.id === assignmentId) ?? items[0];
          if (!shown) return null;
          return (
            <div className="flex flex-col gap-5">
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Fact label="Opens" value={moodleDate(shown.openDate)} />
                <Fact label="Due" value={moodleDate(shown.dueDate)} />
                <Fact label="Cut off" value={moodleDate(shown.cutOffDate)} />
                <Fact label="Grade" value={state?.grade ?? null} />
                <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-3 sm:col-span-2 lg:col-span-4">
                  <dt className="text-xs text-muted-foreground">Your submission</dt>
                  <dd className="flex items-center gap-1.5">
                    <Badge variant="secondary">{submissionLabel(state?.submissionStatus)}</Badge>
                    {graded && <Badge variant="secondary">{graded}</Badge>}
                  </dd>
                </div>
              </dl>
              {hasMoodleText(shown.intro) && (
                <div className="rounded-2xl border border-border bg-card p-4">
                  <MoodleHtml html={shown.intro} />
                </div>
              )}
              <MoodleFiles files={shown.attachments} spaceId={spaceId} />
              {state && state.feedback.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h2 className="text-sm font-semibold">Feedback</h2>
                  {state.feedback.map((html) => (
                    <MoodleHtml
                      key={html}
                      html={html}
                      className="rounded-2xl border border-border bg-card p-4"
                    />
                  ))}
                </section>
              )}
            </div>
          );
        }}
      </MoodleData>
    </MoodleFrame>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}
