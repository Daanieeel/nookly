import { IconSchool } from "@tabler/icons-react";
import { EmptyState } from "#/components/empty-state.tsx";
import { Badge } from "@nookly/ui/components/badge";
import type { MoodleCourse, MoodleStatus } from "#/lib/api/moodle.ts";
import { formatShortDate } from "#/lib/datetime.ts";
import { MoodleAccount } from "./MoodleAccount.tsx";
import { Loading, MoodleFrame, useMoodleNavigate } from "./MoodleFrame.tsx";
import { coursePath, moodleWebUrl } from "./moodle-path.ts";
import { useMoodleCourses } from "./moodle-queries.ts";

/// Current courses first: those that have not ended, then the past ones.
export function sortCourses(courses: MoodleCourse[], now = Date.now() / 1000): MoodleCourse[] {
  const over = (c: MoodleCourse) => c.endDate > 0 && c.endDate < now;
  return [...courses]
    .filter((c) => !c.hidden)
    .sort((a, b) => Number(over(a)) - Number(over(b)) || a.fullName.localeCompare(b.fullName));
}

export function CoursesPage({
  spaceId,
  status,
  siteUrl,
}: {
  spaceId: string;
  status: MoodleStatus;
  siteUrl: string;
}) {
  const query = useMoodleCourses();
  const go = useMoodleNavigate(spaceId);
  const courses = query.data ? sortCourses(query.data.data) : null;
  return (
    <MoodleFrame
      spaceId={spaceId}
      title="Moodle"
      crumbs={[]}
      webUrl={moodleWebUrl(siteUrl, { page: "courses" })}
      fetchedAt={query.data?.fetchedAt}
      offline={query.data?.offline}
    >
      <MoodleAccount status={status} />
      {!courses ? (
        <Loading query={query} />
      ) : courses.length === 0 ? (
        <EmptyState
          icon={IconSchool}
          title="No courses on Moodle"
          description="Courses you are enrolled in show up here."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {courses.map((course) => (
            <li key={course.id}>
              <button
                type="button"
                className="flex size-full flex-col gap-2 rounded-lg border border-border p-4 text-left transition-colors hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring"
                onClick={(e) => go(coursePath(course.id), e)}
              >
                <span className="text-sm font-medium">{course.fullName || course.shortName}</span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {course.shortName && course.fullName && <span>{course.shortName}</span>}
                  {course.startDate > 0 && (
                    <span>{formatShortDate(new Date(course.startDate * 1000))}</span>
                  )}
                  {course.progress !== null && (
                    <Badge variant="secondary">{Math.round(course.progress)}% done</Badge>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </MoodleFrame>
  );
}
