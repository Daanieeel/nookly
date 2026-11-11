import { IconSchool } from "@tabler/icons-react";
import { MoodleIcon } from "@nookly/ui/components/moodle-icon";
import { cn } from "@nookly/ui/lib/utils";
import type { MoodleCourse, MoodleStatus } from "#/lib/api/moodle.ts";
import { formatShortDate } from "#/lib/datetime.ts";
import { CourseArt } from "./CourseArt.tsx";
import { SignOutButton, SignOutError, useMoodleSignOut } from "./MoodleAccount.tsx";
import { FrameActions, MoodleFrame, useMoodleNavigate } from "./MoodleFrame.tsx";
import { MoodleProgress } from "./MoodleProgress.tsx";
import { MoodleData, MoodleEmpty } from "./MoodleStates.tsx";
import { firstNameOf } from "./moodle-format.ts";
import { SAMPLE_COURSES } from "./moodle-samples.ts";
import { coursePath, moodleWebUrl } from "./moodle-path.ts";
import { useMoodleCourses } from "./moodle-queries.ts";

const hasEnded = (c: MoodleCourse, now: number) => c.endDate > 0 && c.endDate < now;

/// Current courses first: those that have not ended, then the past ones.
export function sortCourses(courses: MoodleCourse[], now = Date.now() / 1000): MoodleCourse[] {
  return [...courses]
    .filter((c) => !c.hidden)
    .sort(
      (a, b) =>
        Number(hasEnded(a, now)) - Number(hasEnded(b, now)) || a.fullName.localeCompare(b.fullName),
    );
}

/// The courses that are on, and those that are over.
function splitCourses(courses: MoodleCourse[], now = Date.now() / 1000) {
  const sorted = sortCourses(courses, now);
  return {
    current: sorted.filter((c) => !hasEnded(c, now)),
    past: sorted.filter((c) => hasEnded(c, now)),
  };
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
  const webUrl = moodleWebUrl(siteUrl, { page: "courses" });
  const firstName = firstNameOf(status.fullName);
  const count = query.data ? sortCourses(query.data.data).length : null;
  return (
    <MoodleFrame
      spaceId={spaceId}
      title="Moodle"
      crumbs={[]}
      webUrl={webUrl}
      actions={
        <HeroActions
          status={status}
          webUrl={webUrl}
          fetchedAt={query.data?.fetchedAt}
          offline={query.data?.offline}
        />
      }
      header={
        <header className="relative isolate flex flex-wrap items-center gap-x-4 gap-y-3 overflow-hidden rounded-2xl border border-border bg-card p-5 pt-16">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute -top-24 -left-10 size-64 rounded-full bg-brand-moodle/20 blur-3xl" />
            <div className="absolute -top-20 -right-12 size-72 rounded-full border border-border/60" />
            <div className="absolute -top-32 -right-24 size-96 rounded-full border border-border/40" />
          </div>
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border bg-background shadow-xs">
            <MoodleIcon className="size-8" />
          </div>
          <div className="flex min-w-0 flex-1 basis-60 flex-col">
            <h1 className="truncate text-xl font-semibold tracking-tight">
              {firstName ? `Welcome back, ${firstName}` : "Moodle"}
            </h1>
            <p className="truncate text-sm text-muted-foreground">
              {[status.siteName, count !== null && `${count} ${count === 1 ? "course" : "courses"}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </header>
      }
    >
      <MoodleData
        query={query}
        sample={SAMPLE_COURSES}
        label="Loading your courses"
        empty={(courses) =>
          sortCourses(courses).length === 0 ? (
            <MoodleEmpty
              icon={IconSchool}
              title="No courses on Moodle"
              description="Courses you are enrolled in show up here."
            />
          ) : null
        }
      >
        {(courses) => {
          const { current, past } = splitCourses(courses);
          return (
            <div className="flex flex-col gap-8">
              {current.length > 0 && <CourseGrid spaceId={spaceId} title="Now" courses={current} />}
              {past.length > 0 && (
                <CourseGrid spaceId={spaceId} title="Past courses" courses={past} faded />
              )}
            </div>
          );
        }}
      </MoodleData>
    </MoodleFrame>
  );
}

/// Its own component, so signing out re-renders only these buttons and not the page's queries.
function HeroActions({
  status,
  webUrl,
  fetchedAt,
  offline,
}: {
  status: MoodleStatus;
  webUrl: string;
  fetchedAt?: string;
  offline?: boolean;
}) {
  const signOut = useMoodleSignOut();
  return (
    <div className="flex flex-col items-end gap-1">
      <FrameActions
        webUrl={webUrl}
        fetchedAt={fetchedAt}
        offline={offline}
        trailing={<SignOutButton status={status} signOut={signOut} />}
      />
      <SignOutError signOut={signOut} />
    </div>
  );
}

function CourseGrid({
  spaceId,
  title,
  courses,
  faded,
}: {
  spaceId: string;
  title: string;
  courses: MoodleCourse[];
  faded?: boolean;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        {title}
        <span className="text-xs font-normal text-muted-foreground">{courses.length}</span>
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {courses.map((course) => (
          <li key={course.id}>
            <CourseCard spaceId={spaceId} course={course} faded={faded} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function CourseCard({
  spaceId,
  course,
  faded,
}: {
  spaceId: string;
  course: MoodleCourse;
  faded?: boolean;
}) {
  const go = useMoodleNavigate(spaceId);
  const progress = course.progress === null ? null : Math.round(course.progress);
  return (
    <button
      type="button"
      className={cn(
        "group flex size-full flex-col overflow-hidden rounded-2xl border border-border bg-card text-left transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring",
        faded && "saturate-50",
      )}
      onClick={(e) => go(coursePath(course.id), e)}
    >
      <CourseArt course={course} className="h-28">
        {course.shortName && course.fullName && (
          <span className="absolute top-3 left-3 rounded-md bg-background/80 px-2 py-0.5 text-xs font-medium backdrop-blur-sm">
            {course.shortName}
          </span>
        )}
      </CourseArt>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <span className="line-clamp-2 text-sm/snug font-semibold">
          {course.fullName || course.shortName}
        </span>
        <span className="mt-auto flex flex-col gap-2">
          {course.startDate > 0 && (
            <span className="text-xs text-muted-foreground">
              Started {formatShortDate(new Date(course.startDate * 1000))}
            </span>
          )}
          {progress !== null && (
            <span className="flex items-center gap-2">
              <MoodleProgress value={progress} label="Course progress" className="flex-1" />
              <span className="text-xs text-muted-foreground tabular-nums">{progress}% done</span>
            </span>
          )}
        </span>
      </div>
    </button>
  );
}
