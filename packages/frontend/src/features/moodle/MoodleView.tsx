import { ConnectMoodle } from "./ConnectMoodle.tsx";
import { AssignmentPage } from "./CourseAssignments.tsx";
import { CoursePage } from "./CoursePage.tsx";
import { CoursesPage } from "./CoursesPage.tsx";
import { DiscussionPage, ForumPage } from "./CourseForums.tsx";
import { SectionPage } from "./SectionPage.tsx";
import { parseMoodlePath } from "./moodle-path.ts";
import { useMoodleStatus } from "./moodle-queries.ts";

/// The Moodle module: a read only view of the user's Moodle site. Courses, their files,
/// assignments, grades and announcements are read from Moodle when the site can be reached
/// and from the last answer when it can't. Every page has a button to open the same page on
/// Moodle. The page you are on is the `moodlePath` of the view (`moodle-path.ts`), so Back,
/// Forward and tabs work as anywhere else.
export function MoodleView({ spaceId, moodlePath }: { spaceId: string; moodlePath?: string }) {
  const { data: status } = useMoodleStatus();
  if (!status) return <div className="h-40 animate-pulse rounded-lg bg-muted/40" />;
  if (!status.connected || !status.siteUrl) {
    return <ConnectMoodle reconnect={status.needsReconnect} siteUrl={status.siteUrl} />;
  }
  const siteUrl = status.siteUrl;
  const at = parseMoodlePath(moodlePath);
  switch (at.page) {
    case "courses":
      return <CoursesPage spaceId={spaceId} siteUrl={siteUrl} />;
    case "course":
      return (
        <CoursePage
          key={at.courseId}
          spaceId={spaceId}
          siteUrl={siteUrl}
          courseId={at.courseId}
          tab={at.tab}
        />
      );
    case "assignment":
      return (
        <AssignmentPage
          spaceId={spaceId}
          siteUrl={siteUrl}
          courseId={at.courseId}
          assignmentId={at.assignmentId}
        />
      );
    case "forum":
      return (
        <ForumPage
          spaceId={spaceId}
          siteUrl={siteUrl}
          courseId={at.courseId}
          forumId={at.forumId}
        />
      );
    case "discussion":
      return (
        <DiscussionPage
          spaceId={spaceId}
          siteUrl={siteUrl}
          courseId={at.courseId}
          forumId={at.forumId}
          discussionId={at.discussionId}
        />
      );
    case "section-page":
      return (
        <SectionPage spaceId={spaceId} siteUrl={siteUrl} courseId={at.courseId} cmid={at.cmid} />
      );
  }
}
