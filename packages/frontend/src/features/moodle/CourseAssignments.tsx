import { IconClipboardList } from "@tabler/icons-react";
import { EmptyState } from "#/components/empty-state.tsx";
import { Badge } from "@nookly/ui/components/badge";
import type { MoodleAssignment } from "#/lib/api/moodle.ts";
import { Loading, MoodleFrame, useMoodleNavigate } from "./MoodleFrame.tsx";
import { MoodleFiles } from "./MoodleFiles.tsx";
import { MoodleHtml } from "./MoodleHtml.tsx";
import { useCourseName } from "./CoursePage.tsx";
import { gradingLabel, moodleDate, submissionLabel } from "./moodle-format.ts";
import { hasMoodleText } from "./moodle-html.ts";
import { assignmentPath, coursePath, moodleWebUrl } from "./moodle-path.ts";
import { useMoodleAssignmentStatus, useMoodleAssignments } from "./moodle-queries.ts";

/// Due soonest first; those without a due date last.
export function sortAssignments(items: MoodleAssignment[]): MoodleAssignment[] {
  const key = (a: MoodleAssignment) => (a.dueDate > 0 ? a.dueDate : Number.MAX_SAFE_INTEGER);
  return [...items].sort((a, b) => key(a) - key(b) || a.name.localeCompare(b.name));
}

export function CourseAssignments({ spaceId, courseId }: { spaceId: string; courseId: number }) {
  const query = useMoodleAssignments(courseId);
  const go = useMoodleNavigate(spaceId);
  if (!query.data) return <Loading query={query} />;
  if (query.data.data.length === 0) {
    return (
      <EmptyState
        icon={IconClipboardList}
        title="No assignments"
        description="Assignments your teachers set in this course show up here."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {sortAssignments(query.data.data).map((assignment) => (
        <li key={assignment.id}>
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(e) => go(assignmentPath(courseId, assignment.id), e)}
          >
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{assignment.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {moodleDate(assignment.dueDate)
                ? `Due ${moodleDate(assignment.dueDate)}`
                : "No due date"}
            </span>
          </button>
        </li>
      ))}
    </ul>
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
    >
      {!assignment ? (
        <Loading query={assignments} />
      ) : (
        <div className="flex flex-col gap-4">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Fact label="Opens" value={moodleDate(assignment.openDate)} />
            <Fact label="Due" value={moodleDate(assignment.dueDate)} />
            <Fact label="Cut off" value={moodleDate(assignment.cutOffDate)} />
            <div className="flex items-center gap-2">
              <dt className="text-muted-foreground">Your submission</dt>
              <dd className="flex items-center gap-1.5">
                <Badge variant="secondary">{submissionLabel(state?.submissionStatus)}</Badge>
                {graded && <Badge variant="secondary">{graded}</Badge>}
              </dd>
            </div>
            <Fact label="Grade" value={state?.grade ?? null} />
          </dl>
          {hasMoodleText(assignment.intro) && <MoodleHtml html={assignment.intro} />}
          <MoodleFiles files={assignment.attachments} />
          {state && state.feedback.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold">Feedback</h2>
              {state.feedback.map((html) => (
                <MoodleHtml
                  key={html}
                  html={html}
                  className="rounded-lg border border-border p-3"
                />
              ))}
            </section>
          )}
        </div>
      )}
    </MoodleFrame>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
