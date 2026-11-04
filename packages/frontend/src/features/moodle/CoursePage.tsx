import {
  IconBook2,
  IconClipboardList,
  IconReportAnalytics,
  IconSpeakerphone,
  type Icon,
} from "@tabler/icons-react";
import {
  PageTabs,
  PageTabsBar,
  PageTabsContent,
  PageTabsList,
  PageTabsTrigger,
} from "@nookly/ui/components/page-tabs";
import { formatShortDate } from "#/lib/datetime.ts";
import { CourseAssignments } from "./CourseAssignments.tsx";
import { CourseContents } from "./CourseContents.tsx";
import { CourseForums } from "./CourseForums.tsx";
import { CourseGrades } from "./CourseGrades.tsx";
import { MoodleFrame, useMoodleNavigate } from "./MoodleFrame.tsx";
import { COURSE_TABS, type CourseTab, coursePath, moodleWebUrl } from "./moodle-path.ts";
import { useMoodleCourse } from "./moodle-queries.ts";

const TABS = {
  contents: { label: "Contents", icon: IconBook2 },
  assignments: { label: "Assignments", icon: IconClipboardList },
  grades: { label: "Grades", icon: IconReportAnalytics },
  forums: { label: "Announcements and forums", icon: IconSpeakerphone },
} satisfies Record<CourseTab, { label: string; icon: Icon }>;

/// The course's name, from the list of courses already fetched.
export function useCourseName(courseId: number): string {
  const { data: course } = useMoodleCourse(courseId);
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
  const { data: course } = useMoodleCourse(courseId);
  const name = useCourseName(courseId);
  return (
    <MoodleFrame
      spaceId={spaceId}
      title={name}
      crumbs={[{ label: "Moodle", path: "" }]}
      webUrl={moodleWebUrl(siteUrl, { page: "course", courseId, tab })}
      course={course ?? { id: courseId, overviewFiles: [] }}
      tall
      subtitle={
        course && (
          <p className="text-xs text-muted-foreground">
            {[
              course.shortName !== course.fullName && course.shortName,
              course.startDate > 0 &&
                `Started ${formatShortDate(new Date(course.startDate * 1000))}`,
              course.progress !== null && `${Math.round(course.progress)}% done`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )
      }
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
            {COURSE_TABS.map((t) => {
              const { label, icon: Glyph } = TABS[t];
              return (
                <PageTabsTrigger key={t} value={t}>
                  <Glyph size={14} aria-hidden="true" />
                  {label}
                </PageTabsTrigger>
              );
            })}
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
