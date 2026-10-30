import { IconMessages, IconSpeakerphone } from "@tabler/icons-react";
import { EmptyState } from "#/components/empty-state.tsx";
import { Badge } from "@nookly/ui/components/badge";
import type { MoodleForum } from "#/lib/api/moodle.ts";
import { Loading, MoodleFrame, useMoodleNavigate } from "./MoodleFrame.tsx";
import { MoodleFiles } from "./MoodleFiles.tsx";
import { MoodleHtml } from "./MoodleHtml.tsx";
import { useCourseName } from "./CoursePage.tsx";
import { moodleDate } from "./moodle-format.ts";
import { hasMoodleText } from "./moodle-html.ts";
import { coursePath, discussionPath, forumPath, moodleWebUrl } from "./moodle-path.ts";
import { useMoodleDiscussions, useMoodleForums, useMoodlePosts } from "./moodle-queries.ts";

/// The course's announcements first.
export function orderForums(forums: MoodleForum[]): MoodleForum[] {
  const news = (f: MoodleForum) => Number(f.kind !== "news");
  return [...forums].sort((a, b) => news(a) - news(b) || a.name.localeCompare(b.name));
}

export function CourseForums({ spaceId, courseId }: { spaceId: string; courseId: number }) {
  const query = useMoodleForums(courseId);
  const go = useMoodleNavigate(spaceId);
  if (!query.data) return <Loading query={query} />;
  if (query.data.data.length === 0) {
    return (
      <EmptyState
        icon={IconSpeakerphone}
        title="No announcements or forums"
        description="Announcements and discussions in this course show up here."
      />
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {orderForums(query.data.data).map((forum) => (
        <li key={forum.id}>
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(e) => go(forumPath(courseId, forum.id), e)}
          >
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{forum.name}</span>
            {forum.kind === "news" && <Badge variant="secondary">Announcements</Badge>}
            <span className="shrink-0 text-xs text-muted-foreground">
              {forum.numDiscussions} {forum.numDiscussions === 1 ? "discussion" : "discussions"}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function ForumPage({
  spaceId,
  siteUrl,
  courseId,
  forumId,
}: {
  spaceId: string;
  siteUrl: string;
  courseId: number;
  forumId: number;
}) {
  const forums = useMoodleForums(courseId);
  const discussions = useMoodleDiscussions(forumId);
  const courseName = useCourseName(courseId);
  const go = useMoodleNavigate(spaceId);
  const forum = forums.data?.data.find((f) => f.id === forumId);
  return (
    <MoodleFrame
      spaceId={spaceId}
      title={forum?.name ?? "Forum"}
      crumbs={[
        { label: "Moodle", path: "" },
        { label: courseName, path: coursePath(courseId, "forums") },
      ]}
      webUrl={moodleWebUrl(siteUrl, { page: "forum", courseId, forumId }, forum?.cmid)}
      fetchedAt={discussions.data?.fetchedAt}
      offline={discussions.data?.offline}
    >
      {!discussions.data ? (
        <Loading query={discussions} />
      ) : discussions.data.data.length === 0 ? (
        <EmptyState icon={IconMessages} title="No discussions yet" />
      ) : (
        <ul className="flex flex-col gap-2">
          {discussions.data.data.map((d) => (
            <li key={d.discussionId}>
              <button
                type="button"
                className="flex w-full flex-col gap-0.5 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring"
                onClick={(e) => go(discussionPath(courseId, forumId, d.discussionId), e)}
              >
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {d.subject || d.name}
                  </span>
                  {d.pinned && <Badge variant="secondary">Pinned</Badge>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {[
                    d.author,
                    moodleDate(d.timeModified),
                    d.numReplies > 0 ? `${d.numReplies} replies` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </MoodleFrame>
  );
}

export function DiscussionPage({
  spaceId,
  siteUrl,
  courseId,
  forumId,
  discussionId,
}: {
  spaceId: string;
  siteUrl: string;
  courseId: number;
  forumId: number;
  discussionId: number;
}) {
  const posts = useMoodlePosts(discussionId);
  const forums = useMoodleForums(courseId);
  const discussions = useMoodleDiscussions(forumId);
  const courseName = useCourseName(courseId);
  const forum = forums.data?.data.find((f) => f.id === forumId);
  const discussion = discussions.data?.data.find((d) => d.discussionId === discussionId);
  const first = posts.data?.data[0];
  return (
    <MoodleFrame
      spaceId={spaceId}
      title={discussion?.subject || discussion?.name || first?.subject || "Discussion"}
      crumbs={[
        { label: "Moodle", path: "" },
        { label: courseName, path: coursePath(courseId, "forums") },
        { label: forum?.name ?? "Forum", path: forumPath(courseId, forumId) },
      ]}
      webUrl={moodleWebUrl(siteUrl, { page: "discussion", courseId, forumId, discussionId })}
      fetchedAt={posts.data?.fetchedAt}
      offline={posts.data?.offline}
    >
      {!posts.data ? (
        <Loading query={posts} />
      ) : (
        <ol className="flex flex-col gap-3">
          {posts.data.data.map((post) => (
            <li key={post.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{post.author.fullName}</span>
                <span>{moodleDate(post.timeCreated)}</span>
              </div>
              {hasMoodleText(post.message) && <MoodleHtml html={post.message} />}
              <MoodleFiles files={post.attachments} />
            </li>
          ))}
        </ol>
      )}
    </MoodleFrame>
  );
}
