import {
  dueTone,
  gradingLabel,
  moduleKindLabel,
  percentOf,
  submissionLabel,
} from "@nookly/shared/moodle/format";
import { type MoodleLocation, moodleWebUrl } from "@nookly/shared/moodle/path";
import {
  IconBook2,
  IconClipboardList,
  IconMessages,
  IconReportAnalytics,
} from "@tabler/icons-react-native";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import type {
  MoodleAssignment,
  MoodleForum,
  MoodleGradeItem,
  MoodleModule as Module,
  RemoteFile,
} from "../moodle/api.ts";
import { initialsOf, moduleLook, moodleDay, moodleText } from "../moodle/format.ts";
import {
  useMoodleAssignments,
  useMoodleAssignmentStatus,
  useMoodleConnection,
  useMoodleContents,
  useMoodleDiscussions,
  useMoodleForums,
  useMoodleGrades,
  useMoodlePage,
  useMoodlePosts,
} from "../moodle/queries.ts";
import { useMoodleService } from "../moodle/service.tsx";
import { IconBadge } from "../ui/kit/IconBadge.tsx";
import { EmptyState } from "../ui/kit/States.tsx";
import { useSemantic } from "../ui/kit/scheme.ts";
import { PageTabs } from "../ui/PageTabs.tsx";
import { Row, ROW_DIVIDER, Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { CORNER, RADIUS } from "../ui/tokens.ts";
import { FileRow, MoodleBar, MoodleData } from "./MoodleParts.tsx";
import { type MoodleFileTarget, fileRoute } from "./MoodleFile.tsx";

/// A course on Moodle and what is in it, as the desktop's `CoursePage`, `CourseContents`,
/// `CourseAssignments`, `CourseGrades` and `CourseForums`: everything Nookly can read is
/// read here, the rest opens on Moodle.

/// The same page on the Moodle website, once the site is known.
function useWebUrl(location: MoodleLocation, cmid?: number): string | null {
  const { data: connection } = useMoodleConnection();
  return connection ? moodleWebUrl(connection.site.root, location, cmid) : null;
}

/// Opens a file of the site in Nookly's viewer.
function useOpenFile() {
  const router = useRouter();
  return (target: MoodleFileTarget) => router.push(fileRoute(target));
}

/// Moodle's text, when it says anything.
function MoodleText({ html, muted = false }: { html: string; muted?: boolean }) {
  const text = moodleText(html);
  if (!text) return null;
  return (
    <Text selectable tone={muted ? "muted" : "default"} className="px-1">
      {text}
    </Text>
  );
}

const COURSE_TABS = [
  { id: "contents", label: "Contents" },
  { id: "assignments", label: "Assignments" },
  { id: "grades", label: "Grades" },
  { id: "forums", label: "Forums" },
] as const;
type CourseTab = (typeof COURSE_TABS)[number]["id"];

/// A course on Moodle, with the desktop's tabs.
export function MoodleCourseScreen({ courseId, spaceId }: { courseId: number; spaceId: string }) {
  const [tab, setTab] = useState<CourseTab>("contents");
  const webUrl = useWebUrl({ page: "course", courseId, tab });
  return (
    <Screen>
      <PageTabs label="Course" value={tab} onChange={setTab} tabs={[...COURSE_TABS]} />
      <MoodleBar url={webUrl} />
      {tab === "contents" ? (
        <Contents courseId={courseId} spaceId={spaceId} webUrl={webUrl} />
      ) : null}
      {tab === "assignments" ? <Assignments courseId={courseId} webUrl={webUrl} /> : null}
      {tab === "grades" ? <Grades courseId={courseId} webUrl={webUrl} /> : null}
      {tab === "forums" ? <Forums courseId={courseId} spaceId={spaceId} webUrl={webUrl} /> : null}
    </Screen>
  );
}

const sectionTitle = (name: string, index: number) =>
  name || (index === 0 ? "General" : `Section ${index + 1}`);

function Contents({
  courseId,
  spaceId,
  webUrl,
}: {
  courseId: number;
  spaceId: string;
  webUrl: string | null;
}) {
  const contents = useMoodleContents(courseId);
  return (
    <MoodleData
      query={contents}
      label="Loading the course contents"
      webUrl={webUrl}
      empty={(sections) =>
        sections.length === 0 ? (
          <EmptyState
            glyph={IconBook2}
            title="Nothing in this course yet"
            message="Sections, files and links your teachers add show up here."
          />
        ) : null
      }
    >
      {(sections) =>
        sections.map((section, index) => (
          <Section key={section.id} title={sectionTitle(section.name, index)}>
            <MoodleText html={section.summary} muted />
            {section.modules.map((module) => (
              <ModuleItem key={module.id} courseId={courseId} spaceId={spaceId} module={module} />
            ))}
          </Section>
        ))
      }
    </MoodleData>
  );
}

/// One item of a course: files and pages read in Nookly, assignments and forums open their
/// page here, anything else opens on Moodle.
function ModuleItem({
  courseId,
  spaceId,
  module,
}: {
  courseId: number;
  spaceId: string;
  module: Module;
}) {
  const router = useRouter();
  const service = useMoodleService();
  const openFile = useOpenFile();
  const files = module.contents.filter((f) => f.type === "file" && f.fileurl);
  const look = moduleLook(module.modname);
  let row: React.ReactNode;
  if (module.modname === "assign") {
    row = <AssignmentItem courseId={courseId} module={module} />;
  } else if (module.modname === "forum") {
    row = <ForumItem courseId={courseId} spaceId={spaceId} module={module} />;
  } else if (files.length > 0 && module.modname !== "page") {
    const single = files.length === 1 && module.modname !== "folder";
    row = (
      <>
        {single ? null : (
          <Text variant="label" className="px-1 pt-2">
            {`${module.name} · ${files.length} files`}
          </Text>
        )}
        {files.map((file) => (
          <FileRow
            key={`${file.filepath}${file.filename}${file.fileurl}`}
            file={file}
            title={single ? module.name : file.filename}
            onPress={() =>
              openFile({ courseId, spaceId, cmid: module.id, index: module.contents.indexOf(file) })
            }
          />
        ))}
      </>
    );
  } else {
    const page = module.modname === "page";
    row = (
      <Row
        title={module.name}
        subtitle={moduleKindLabel(module.modname)}
        icon={<IconBadge glyph={look.glyph} tint={look.tint} />}
        onPress={
          page
            ? () =>
                router.push(
                  `/moodle/page/${module.id}?courseId=${courseId}&name=${encodeURIComponent(module.name)}`,
                )
            : module.url
              ? () => void service.open(module.url)
              : undefined
        }
      />
    );
  }
  return (
    <>
      {row}
      <MoodleText html={module.description} muted />
    </>
  );
}

const assignmentRoute = (courseId: number, a: MoodleAssignment) =>
  `/moodle/assignment/${a.id}?courseId=${courseId}&name=${encodeURIComponent(a.name)}`;

const forumRoute = (courseId: number, spaceId: string, f: MoodleForum) =>
  `/moodle/forum/${f.id}?courseId=${courseId}&spaceId=${spaceId}&name=${encodeURIComponent(f.name)}`;

/// "Due Mon, Nov 20" with "Overdue" or "Due soon" first when it calls for attention.
function dueLine(a: MoodleAssignment): string {
  const due = moodleDay(a.duedate);
  if (!due) return "No due date";
  const tone = dueTone(a.duedate);
  const badge = tone === "overdue" ? "Overdue · " : tone === "soon" ? "Due soon · " : "";
  return `${badge}Due ${due}`;
}

function AssignmentItem({ courseId, module }: { courseId: number; module: Module }) {
  const router = useRouter();
  const service = useMoodleService();
  const assignment = useMoodleAssignments(courseId).data?.data.find((a) => a.cmid === module.id);
  return (
    <Row
      title={module.name}
      subtitle={assignment ? `Assignment · ${dueLine(assignment)}` : "Assignment"}
      icon={<IconBadge glyph={IconClipboardList} tint="purple" />}
      onPress={() =>
        assignment
          ? router.push(assignmentRoute(courseId, assignment))
          : module.url
            ? void service.open(module.url)
            : undefined
      }
    />
  );
}

const discussionsLine = (forum: MoodleForum) =>
  `${forum.type === "news" ? "Announcements" : "Forum"} · ${forum.numdiscussions} ${
    forum.numdiscussions === 1 ? "discussion" : "discussions"
  }`;

function ForumItem({
  courseId,
  spaceId,
  module,
}: {
  courseId: number;
  spaceId: string;
  module: Module;
}) {
  const router = useRouter();
  const service = useMoodleService();
  const forum = useMoodleForums(courseId).data?.data.find((f) => f.cmid === module.id);
  return (
    <Row
      title={module.name}
      subtitle={forum ? discussionsLine(forum) : "Forum"}
      icon={<IconBadge glyph={IconMessages} tint="green" />}
      onPress={() =>
        forum
          ? router.push(forumRoute(courseId, spaceId, forum))
          : module.url
            ? void service.open(module.url)
            : undefined
      }
    />
  );
}

function Assignments({ courseId, webUrl }: { courseId: number; webUrl: string | null }) {
  const router = useRouter();
  const assignments = useMoodleAssignments(courseId);
  return (
    <MoodleData
      query={assignments}
      label="Loading the assignments"
      webUrl={webUrl}
      empty={(all) =>
        all.length === 0 ? (
          <EmptyState
            glyph={IconClipboardList}
            title="No assignments"
            message="Assignments your teachers set in this course show up here."
          />
        ) : null
      }
    >
      {(all) => (
        <Section>
          {[...all]
            .sort((a, b) => (a.duedate || Infinity) - (b.duedate || Infinity))
            .map((a) => (
              <Row
                key={a.id}
                title={a.name}
                subtitle={dueLine(a)}
                icon={<IconBadge glyph={IconClipboardList} tint="purple" />}
                onPress={() => router.push(assignmentRoute(courseId, a))}
              />
            ))}
        </Section>
      )}
    </MoodleData>
  );
}

/// How far a grade got, as a thin bar under it.
function GradeBar({ percent }: { percent: number }) {
  const track = useSemantic("fill");
  return (
    <View style={{ height: 4, borderRadius: 2, backgroundColor: track, overflow: "hidden" }}>
      <View className="h-full bg-positive" style={{ width: `${percent}%` }} />
    </View>
  );
}

function GradeRow({ item }: { item: MoodleGradeItem }) {
  const total = item.itemtype === "course";
  const title = item.itemname || (total ? "Course total" : "Grade");
  const grade = item.gradeformatted && item.gradeformatted !== "-" ? item.gradeformatted : null;
  const percent = percentOf(item.percentageformatted);
  const facts = [
    item.percentageformatted && item.percentageformatted !== "-" ? item.percentageformatted : null,
    item.weightformatted && item.weightformatted !== "-" ? `Weight ${item.weightformatted}` : null,
    item.rangeformatted ? `Out of ${item.rangeformatted}` : null,
  ].filter(Boolean);
  return (
    <View accessible className={`gap-1.5 px-1 py-2.5 ${ROW_DIVIDER}`}>
      <View className="flex-row items-center gap-3">
        <IconBadge glyph={IconReportAnalytics} tint="green" />
        <View className="flex-1 gap-0.5">
          <Text testID="grade-title" className={total ? "font-semibold" : "font-medium"}>
            {title}
          </Text>
          {facts.length > 0 ? (
            <Text variant="small" tone="muted">
              {facts.join(" · ")}
            </Text>
          ) : null}
        </View>
        <Text className="font-semibold" tone={grade ? "default" : "muted"}>
          {grade ?? "No grade"}
        </Text>
      </View>
      {percent !== null ? <GradeBar percent={percent} /> : null}
      {item.feedback ? <MoodleText html={item.feedback} muted /> : null}
    </View>
  );
}

function Grades({ courseId, webUrl }: { courseId: number; webUrl: string | null }) {
  const grades = useMoodleGrades(courseId);
  return (
    <MoodleData
      query={grades}
      label="Loading your grades"
      webUrl={webUrl}
      empty={(items) =>
        items.length === 0 ? (
          <EmptyState
            glyph={IconReportAnalytics}
            title="No grades yet"
            message="Grades show up here once your teachers publish them."
          />
        ) : null
      }
    >
      {(items) => (
        <View>
          {[...items]
            .sort((a, b) => Number(a.itemtype === "course") - Number(b.itemtype === "course"))
            .map((item) => (
              <GradeRow key={item.id} item={item} />
            ))}
        </View>
      )}
    </MoodleData>
  );
}

function Forums({
  courseId,
  spaceId,
  webUrl,
}: {
  courseId: number;
  spaceId: string;
  webUrl: string | null;
}) {
  const router = useRouter();
  const forums = useMoodleForums(courseId);
  return (
    <MoodleData
      query={forums}
      label="Loading announcements and forums"
      webUrl={webUrl}
      empty={(all) =>
        all.length === 0 ? (
          <EmptyState
            glyph={IconMessages}
            title="No announcements or forums"
            message="Announcements and discussions in this course show up here."
          />
        ) : null
      }
    >
      {(all) => (
        <Section>
          {[...all]
            .sort((a, b) => Number(b.type === "news") - Number(a.type === "news"))
            .map((forum) => (
              <Row
                key={forum.id}
                title={forum.name}
                subtitle={discussionsLine(forum)}
                icon={<IconBadge glyph={IconMessages} tint="green" />}
                onPress={() => router.push(forumRoute(courseId, spaceId, forum))}
              />
            ))}
        </Section>
      )}
    </MoodleData>
  );
}

/// A fact of an assignment on its row, when it has one.
function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <Row
      title={label}
      trailing={
        <Text tone="muted" selectable>
          {value}
        </Text>
      }
    />
  );
}

/// An assignment: when it is due, what it asks, its files, and where the hand in stands.
export function MoodleAssignmentScreen({
  courseId,
  assignmentId,
}: {
  courseId: number;
  assignmentId: number;
}) {
  const assignments = useMoodleAssignments(courseId);
  const status = useMoodleAssignmentStatus(assignmentId);
  const openFile = useOpenFile();
  const assignment = assignments.data?.data.find((a) => a.id === assignmentId);
  const webUrl = useWebUrl(
    { page: "assignment", courseId, assignmentId },
    assignment?.cmid || undefined,
  );
  return (
    <Screen>
      <MoodleBar url={webUrl} />
      <MoodleData
        query={assignments}
        label="Loading the assignment"
        webUrl={webUrl}
        rows={3}
        empty={(all) =>
          all.some((a) => a.id === assignmentId) ? null : (
            <EmptyState
              glyph={IconClipboardList}
              title="This assignment is gone"
              message="Moodle no longer lists it in this course."
            />
          )
        }
      >
        {() =>
          assignment ? (
            <>
              <Section>
                <Fact label="Opens" value={moodleDay(assignment.allowsubmissionsfromdate)} />
                <Fact label="Due" value={moodleDay(assignment.duedate)} />
                <Fact label="Cut off" value={moodleDay(assignment.cutoffdate)} />
              </Section>
              <MoodleText html={assignment.intro} />
              {assignment.introattachments.length > 0 ? (
                <Section title="Files">
                  {assignment.introattachments.map((file) => (
                    <FileRow
                      key={file.fileurl}
                      file={file}
                      onPress={() => openFile({ courseId, file })}
                    />
                  ))}
                </Section>
              ) : null}
              <MoodleData query={status} label="Loading your submission" rows={2}>
                {(state) => (
                  <Section title="Your submission">
                    <Fact label="Submission" value={submissionLabel(state.submission)} />
                    <Fact label="Grading" value={gradingLabel(state.grading)} />
                    <Fact label="Grade" value={state.grade} />
                    {state.feedback.map((html, i) => (
                      <MoodleText key={i} html={html} />
                    ))}
                  </Section>
                )}
              </MoodleData>
            </>
          ) : null
        }
      </MoodleData>
    </Screen>
  );
}

/// A forum: its discussions, pinned ones as Moodle orders them.
export function MoodleForumScreen({
  courseId,
  forumId,
  spaceId,
}: {
  courseId: number;
  forumId: number;
  spaceId: string;
}) {
  const router = useRouter();
  const forum = useMoodleForums(courseId).data?.data.find((f) => f.id === forumId);
  const discussions = useMoodleDiscussions(forumId);
  const webUrl = useWebUrl({ page: "forum", courseId, forumId }, forum?.cmid || undefined);
  return (
    <Screen>
      <MoodleBar url={webUrl} />
      {forum ? <MoodleText html={forum.intro} muted /> : null}
      <MoodleData
        query={discussions}
        label="Loading the discussions"
        webUrl={webUrl}
        empty={(all) =>
          all.length === 0 ? (
            <EmptyState
              glyph={IconMessages}
              title="No discussions yet"
              message="Posts in this forum show up here."
            />
          ) : null
        }
      >
        {(all) => (
          <Section>
            {all.map((d) => (
              <Row
                key={d.discussion}
                title={d.name || d.subject}
                subtitle={[
                  d.pinned ? "Pinned" : null,
                  d.userfullname,
                  moodleDay(d.timemodified),
                  d.numreplies > 0
                    ? `${d.numreplies} ${d.numreplies === 1 ? "reply" : "replies"}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                icon={<IconBadge glyph={IconMessages} tint="green" />}
                onPress={() =>
                  router.push(
                    `/moodle/discussion/${d.discussion}?courseId=${courseId}&spaceId=${spaceId}&name=${encodeURIComponent(d.name || d.subject)}`,
                  )
                }
              />
            ))}
          </Section>
        )}
      </MoodleData>
    </Screen>
  );
}

/// The tile with a writer's initials beside a post.
function Initials({ name }: { name: string }) {
  const fill = useSemantic("fill");
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        ...CORNER,
        width: 32,
        height: 32,
        borderRadius: RADIUS.badge,
        backgroundColor: fill,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text variant="label">{initialsOf(name)}</Text>
    </View>
  );
}

/// A forum discussion: its posts, oldest first, each with who wrote it and its files.
export function MoodleDiscussionScreen({
  discussionId,
  courseId = 0,
}: {
  discussionId: number;
  courseId?: number;
}) {
  const posts = useMoodlePosts(discussionId);
  const openFile = useOpenFile();
  const webUrl = useWebUrl({ page: "discussion", courseId, forumId: 0, discussionId });
  return (
    <Screen>
      <MoodleBar url={webUrl} />
      <MoodleData query={posts} label="Loading the posts" webUrl={webUrl} rows={3}>
        {(all) =>
          all.map((post) => (
            <View key={post.id} className={`gap-2 pb-4 ${ROW_DIVIDER}`}>
              <View className="flex-row items-center gap-2.5">
                <Initials name={post.author.fullname} />
                <View className="flex-1">
                  <Text className="font-semibold">{post.subject}</Text>
                  <Text variant="small" tone="muted">
                    {[post.author.fullname, moodleDay(post.timecreated)]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </View>
              </View>
              <MoodleText html={post.message} />
              {post.attachments.map((file) => (
                <FileRow
                  key={file.fileurl}
                  file={file}
                  onPress={() => openFile({ courseId, file })}
                />
              ))}
            </View>
          ))
        }
      </MoodleData>
    </Screen>
  );
}

/// A Moodle page (the "Page" item of a course), read in Nookly.
export function MoodlePageScreen({ courseId, cmid }: { courseId: number; cmid: number }) {
  const contents = useMoodleContents(courseId);
  const module = contents.data?.data
    .flatMap((section) => section.modules)
    .find((m) => m.id === cmid);
  const html: RemoteFile | undefined = module?.contents.find((f) => f.type === "file");
  const page = useMoodlePage(html?.fileurl ?? "");
  const webUrl = useWebUrl({ page: "section-page", courseId, cmid });
  return (
    <Screen>
      {module ? <Stack.Screen options={{ title: module.name }} /> : null}
      <MoodleBar url={webUrl} />
      {contents.error || (contents.data && !html) ? (
        <MoodleData
          query={contents}
          label="Loading the page"
          webUrl={webUrl}
          empty={() => (
            <EmptyState
              glyph={IconBook2}
              title="This page is gone"
              message="Moodle no longer lists it in this course."
            />
          )}
        >
          {() => null}
        </MoodleData>
      ) : (
        <MoodleData query={page} label="Loading the page" webUrl={webUrl}>
          {(text) => <MoodleText html={text} />}
        </MoodleData>
      )}
    </Screen>
  );
}
