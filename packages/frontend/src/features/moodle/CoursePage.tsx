import {
  PageTabs,
  PageTabsBar,
  PageTabsContent,
  PageTabsList,
  PageTabsTrigger,
} from "@nookly/ui/components/page-tabs";
import { CourseAssignments } from "./CourseAssignments.tsx";
import { CourseContents } from "./CourseContents.tsx";
import { CourseForums } from "./CourseForums.tsx";
import { CourseGrades } from "./CourseGrades.tsx";
import { MoodleFrame, useMoodleNavigate } from "./MoodleFrame.tsx";
import { COURSE_TABS, type CourseTab, coursePath, moodleWebUrl } from "./moodle-path.ts";
import { useMoodleCourses } from "./moodle-queries.ts";

const TAB_LABELS = {
  contents: "Contents",
  assignments: "Assignments",
  grades: "Grades",
  forums: "Announcements and forums",
} satisfies Record<CourseTab, string>;

/// The course's name, from the list of courses already fetched.
export function useCourseName(courseId: number): string {
  const { data } = useMoodleCourses();
  const course = data?.data.find((c) => c.id === courseId);
  return course?.fullName || course?.shortName || "Course";
}

export function CoursePage({
  spaceId,
  siteUrl,
  courseId,
  tab,
}: {
  spaceId: string;
  siteUrl: string;
  courseId: number;
  tab: CourseTab;
}) {
  const go = useMoodleNavigate(spaceId);
  const name = useCourseName(courseId);
  return (
    <MoodleFrame
      spaceId={spaceId}
      title={name}
      crumbs={[{ label: "Moodle", path: "" }]}
      webUrl={moodleWebUrl(siteUrl, { page: "course", courseId, tab })}
    >
      <PageTabs
        value={tab}
        onValueChange={(value) => {
          const next = COURSE_TABS.find((t) => t === value);
          if (next) go(coursePath(courseId, next));
        }}
      >
        <PageTabsBar>
          <PageTabsList>
            {COURSE_TABS.map((t) => (
              <PageTabsTrigger key={t} value={t}>
                {TAB_LABELS[t]}
              </PageTabsTrigger>
            ))}
          </PageTabsList>
        </PageTabsBar>
        <PageTabsContent value="contents">
          <CourseContents spaceId={spaceId} courseId={courseId} />
        </PageTabsContent>
        <PageTabsContent value="assignments">
          <CourseAssignments spaceId={spaceId} courseId={courseId} />
        </PageTabsContent>
        <PageTabsContent value="grades">
          <CourseGrades courseId={courseId} />
        </PageTabsContent>
        <PageTabsContent value="forums">
          <CourseForums spaceId={spaceId} courseId={courseId} />
        </PageTabsContent>
      </PageTabs>
    </MoodleFrame>
  );
}
