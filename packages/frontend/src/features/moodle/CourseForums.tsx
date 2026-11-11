import { IconChevronRight, IconMessages, IconSpeakerphone } from "@tabler/icons-react";
import { Badge } from "@nookly/ui/components/badge";
import { cn } from "@nookly/ui/lib/utils";
import type { MoodleForum } from "#/lib/api/moodle.ts";
import { MoodleFrame, useMoodleNavigate } from "./MoodleFrame.tsx";
import { MoodleData, MoodleEmpty } from "./MoodleStates.tsx";
import { MoodleFiles } from "./MoodleFiles.tsx";
import { MoodleHtml } from "./MoodleHtml.tsx";
import { useCourseName } from "./CoursePage.tsx";
import { moodleDate } from "./moodle-format.ts";
import { SAMPLE_DISCUSSIONS, SAMPLE_FORUMS, SAMPLE_POSTS } from "./moodle-samples.ts";
import { hasMoodleText } from "./moodle-html.ts";
import { coursePath, discussionPath, forumPath, moodleWebUrl } from "./moodle-path.ts";
import {
  useMoodleCourse,
  useMoodleDiscussions,
  useMoodleForums,
  useMoodlePosts,
} from "./moodle-queries.ts";

/// The course's announcements first.
export function orderForums(forums: MoodleForum[]): MoodleForum[] {
  const news = (f: MoodleForum) => Number(f.kind !== "news");
  return [...forums].sort((a, b) => news(a) - news(b) || a.name.localeCompare(b.name));
}

export function CourseForums({ spaceId, courseId }: { spaceId: string; courseId: number }) {
  const query = useMoodleForums(courseId);
  const go = useMoodleNavigate(spaceId);
  return (
    <MoodleData
      query={query}
      sample={SAMPLE_FORUMS}
      label="Loading announcements and forums"
      empty={(forums) =>
        forums.length === 0 ? (
          <MoodleEmpty
            icon={IconSpeakerphone}
            title="No announcements or forums"
            description="Announcements and discussions in this course show up here."
          />
        ) : null
      }
    >
      {(forums) => (
        <ul className="flex flex-col gap-3">
          {orderForums(forums).map((forum) => {
            const news = forum.kind === "news";
            const Glyph = news ? IconSpeakerphone : IconMessages;
            return (
              <li key={forum.id}>
                <button
                  type="button"
                  className="group flex w-full items-center gap-4 rounded-2xl border border-border bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={(e) => go(forumPath(courseId, forum.id), e)}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-11 shrink-0 items-center justify-center rounded-xl",
                      news
                        ? "bg-accent-pink/10 text-accent-pink"
                        : "bg-accent-green/10 text-accent-green",
                    )}
                  >
                    <Glyph size={20} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-semibold">{forum.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {forum.numDiscussions}{" "}
                      {forum.numDiscussions === 1 ? "discussion" : "discussions"}
                    </span>
                  </span>
                  {news && <Badge variant="secondary">Announcements</Badge>}
                  <IconChevronRight
                    size={16}
                    aria-hidden="true"
                    className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </MoodleData>
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
  const { data: course } = useMoodleCourse(courseId);
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
      course={course ?? { id: courseId, overviewFiles: [] }}
    >
      <MoodleData
        query={discussions}
        sample={SAMPLE_DISCUSSIONS}
        label="Loading the discussions"
        empty={(items) =>
          items.length === 0 ? (
            <MoodleEmpty
              icon={IconMessages}
              title="No discussions yet"
              description="Posts in this forum show up here."
            />
          ) : null
        }
      >
        {(items) => (
          <ul className="flex flex-col gap-3">
            {items.map((d) => (
              <li key={d.discussionId}>
                <button
                  type="button"
                  className="group flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={(e) => go(discussionPath(courseId, forumId, d.discussionId), e)}
                >
                  <Avatar name={d.author} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {d.subject || d.name}
                      </span>
                      {d.pinned && <Badge variant="secondary">Pinned</Badge>}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {[
                        d.author,
                        moodleDate(d.timeModified),
                        d.numReplies > 0 ? `${d.numReplies} replies` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <IconChevronRight
                    size={16}
                    aria-hidden="true"
                    className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </MoodleData>
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
  const { data: course } = useMoodleCourse(courseId);
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
      webUrl={moodleWebUrl(siteUrl, {
        page: "discussion",
        courseId,
        forumId,
        discussionId,
      })}
      fetchedAt={posts.data?.fetchedAt}
      offline={posts.data?.offline}
      course={course ?? { id: courseId, overviewFiles: [] }}
    >
      <MoodleData query={posts} sample={SAMPLE_POSTS} label="Loading the posts">
        {(items) => (
          <ol className="flex flex-col gap-3">
            {items.map((post) => (
              <li key={post.id} className="flex gap-3 rounded-2xl border border-border bg-card p-4">
                <Avatar name={post.author.fullName} />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="text-sm font-semibold text-foreground">
                      {post.author.fullName}
                    </span>
                    <span>{moodleDate(post.timeCreated)}</span>
                  </div>
                  {hasMoodleText(post.message) && <MoodleHtml html={post.message} />}
                  <MoodleFiles files={post.attachments} spaceId={spaceId} context={{ courseId }} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </MoodleData>
    </MoodleFrame>
  );
}

/// The first letters of a name on a tile, in a color that stays the same for that name.
const AVATAR_TONES = [
  "bg-accent-blue/15 text-accent-blue",
  "bg-accent-green/15 text-accent-green",
  "bg-accent-pink/15 text-accent-pink",
  "bg-accent-purple/15 text-accent-purple",
  "bg-accent-yellow/15 text-accent-yellow",
] as const;

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  const sum = [...name].reduce((total, char) => total + char.charCodeAt(0), 0);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        AVATAR_TONES[sum % AVATAR_TONES.length],
      )}
    >
      {initials || "?"}
    </span>
  );
}
