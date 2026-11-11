import { IconBook2 } from "@tabler/icons-react";
import { MoodleFrame } from "./MoodleFrame.tsx";
import { MoodleData, MoodleEmpty } from "./MoodleStates.tsx";
import { MoodleHtml } from "./MoodleHtml.tsx";
import { useCourseName } from "./CoursePage.tsx";
import { coursePath, moodleWebUrl } from "./moodle-path.ts";
import { SAMPLE_SECTIONS } from "./moodle-samples.ts";
import { useMoodleContents, useMoodleCourse, useMoodlePageText } from "./moodle-queries.ts";

const SAMPLE_PAGE =
  "<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p><p>Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>";

/// The page body wrapped like the answers of the other queries, which `MoodleData` reads.
const fetchedText = (html: string) => ({ data: html, fetchedAt: "", offline: false });

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
  const { data: course } = useMoodleCourse(courseId);
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
      course={course ?? { id: courseId, overviewFiles: [] }}
    >
      <MoodleData
        query={contents}
        sample={SAMPLE_SECTIONS}
        label="Loading the page"
        empty={(sections) =>
          sections.flatMap((s) => s.modules).some((m) => m.id === cmid) ? null : (
            <MoodleEmpty
              icon={IconBook2}
              title="This page is gone"
              description="Moodle no longer lists it in this course."
            />
          )
        }
      >
        {() =>
          body ? (
            <MoodleData
              query={{
                ...text,
                data: text.data === undefined ? undefined : fetchedText(text.data),
              }}
              sample={SAMPLE_PAGE}
              label="Loading the page"
            >
              {(html) => (
                <div className="rounded-2xl border border-border bg-card p-5">
                  <MoodleHtml html={html} />
                </div>
              )}
            </MoodleData>
          ) : (
            <MoodleEmpty
              icon={IconBook2}
              title="Nothing to read here"
              description="This page has no text of its own."
            />
          )
        }
      </MoodleData>
    </MoodleFrame>
  );
}
