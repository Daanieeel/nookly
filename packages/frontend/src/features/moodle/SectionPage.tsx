import { Loading, MoodleFrame } from "./MoodleFrame.tsx";
import { MoodleHtml } from "./MoodleHtml.tsx";
import { useCourseName } from "./CoursePage.tsx";
import { coursePath, moodleWebUrl } from "./moodle-path.ts";
import { useMoodleContents, useMoodlePageText } from "./moodle-queries.ts";

/// A Moodle "Page" item: its body is an HTML file on the site.
export function SectionPage({
  spaceId,
  siteUrl,
  courseId,
  cmid,
}: {
  spaceId: string;
  siteUrl: string;
  courseId: number;
  cmid: number;
}) {
  const contents = useMoodleContents(courseId);
  const courseName = useCourseName(courseId);
  const module = contents.data?.data.flatMap((s) => s.modules).find((m) => m.id === cmid);
  const body = module?.contents.find((f) => f.fileName === "index.html") ?? module?.contents[0];
  const text = useMoodlePageText(body?.fileUrl ?? "");
  return (
    <MoodleFrame
      spaceId={spaceId}
      title={module?.name ?? "Page"}
      crumbs={[
        { label: "Moodle", path: "" },
        { label: courseName, path: coursePath(courseId) },
      ]}
      webUrl={moodleWebUrl(siteUrl, { page: "section-page", courseId, cmid })}
    >
      {!module || !body ? (
        <Loading query={contents} />
      ) : text.data === undefined ? (
        <Loading query={text} />
      ) : (
        <MoodleHtml html={text.data} />
      )}
    </MoodleFrame>
  );
}
