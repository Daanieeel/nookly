import {
  IconBook2,
  IconClipboardList,
  IconFile,
  IconLink,
  IconLock,
  IconLogout,
  IconMessages,
  IconReportAnalytics,
  IconSchool,
  IconSpeakerphone,
  IconWorld,
} from "@tabler/icons-react-native";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import {
  type Connection,
  fileUrl,
  type MoodleAssignment,
  type MoodleForum,
  type MoodleModule,
} from "../moodle/api.ts";
import {
  useForgetMoodle,
  useMoodleAssignments,
  useMoodleConnection,
  useMoodleContents,
  useMoodleCourses,
  useMoodleDiscussions,
  useMoodleForums,
  useMoodleGrades,
  useMoodlePosts,
} from "../moodle/queries.ts";
import { type MoodleService, useMoodleService } from "../moodle/service.tsx";
import { Button, statusOf } from "../ui/Button.tsx";
import { Field } from "../ui/Field.tsx";
import { FormSection } from "../ui/kit/Form.tsx";
import { IconBadge } from "../ui/kit/IconBadge.tsx";
import { ListTitle } from "../ui/ListBar.tsx";
import { PageTabs } from "../ui/PageTabs.tsx";
import { Empty, Row, Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import type { TintName } from "../ui/tokens.ts";
import { dayLabel, localDay } from "./dates.ts";

/// Moodle on the phone, as on the desktop (`features/moodle`): connect once with the
/// university's own sign in page, then read the courses, their contents, assignments,
/// grades and forums without opening the website.

/// Text out of Moodle's HTML (a summary, a forum post), for a line or two.
export function plainText(html: string): string {
  return html
    .replace(/<(br|\/p|\/div|\/li)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/// A Moodle date (seconds since 1970) as a day, or null for none.
const dayOf = (seconds: number) => (seconds > 0 ? localDay(new Date(seconds * 1000)) : null);

/// What a module is drawn with, as the desktop's `moodle-icons.tsx`.
interface ModuleLook {
  glyph: typeof IconFile;
  tint: TintName;
}
function moduleLook(name: string): ModuleLook {
  switch (name) {
    case "assign":
      return { glyph: IconClipboardList, tint: "purple" };
    case "forum":
      return { glyph: IconMessages, tint: "green" };
    case "page":
      return { glyph: IconBook2, tint: "blue" };
    case "url":
      return { glyph: IconLink, tint: "blue" };
    default:
      return { glyph: IconFile, tint: "gray" };
  }
}

/// Opens something on the site in the browser; a file with the token, so it opens signed in.
function openOnSite(
  service: MoodleService,
  connection: Connection | null | undefined,
  url: string,
  file = false,
) {
  const target = file && connection ? (fileUrl(connection, url) ?? url) : url;
  if (target) void service.open(target);
}

/// Connecting: the site's address, then its own sign in page in the browser. Moodle sends
/// the person back to Nookly, which finishes the rest (`app/moodle-signin.tsx`).
function ConnectMoodle() {
  const theme = useTheme();
  const service = useMoodleService();
  const [site, setSite] = useState("");
  const open = useMutation({
    mutationFn: async (address: string) => service.open(await service.account.begin(address)),
  });
  return (
    <View className="gap-5 py-4">
      <View className="items-center gap-3">
        <IconBadge glyph={IconSchool} tint="blue" size={56} />
        <Text variant="title" accessibilityRole="header" className="text-center">
          Connect your Moodle
        </Text>
        <Text tone="muted" className="text-center">
          Read your courses, files, assignments, grades and announcements here, without opening the
          website.
        </Text>
      </View>
      <FormSection>
        <Field
          label="Moodle address"
          icon={<IconWorld size={18} color={theme.colors.mutedForeground} />}
          placeholder="moodle.youruniversity.edu"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          value={site}
          onChangeText={setSite}
          onSubmitEditing={() => site.trim() && open.mutate(site)}
        />
      </FormSection>
      {open.error ? <Text tone="destructive">{open.error.message}</Text> : null}
      <Button
        label="Sign In with Moodle"
        size="lg"
        status={statusOf(open)}
        errorLabel="Try Again"
        onPress={() => site.trim() && open.mutate(site)}
      />
      {open.isSuccess ? (
        <Text variant="small" tone="muted" className="text-center">
          Sign in on the page that opened. Nookly continues by itself when you are done.
        </Text>
      ) : null}
      <View className="flex-row items-start justify-center gap-1.5">
        <IconLock size={13} color={theme.colors.mutedForeground} />
        <Text variant="small" tone="muted" className="flex-1 text-center">
          You sign in on your university's own page. Nookly never sees your password and only reads
          from Moodle.
        </Text>
      </View>
    </View>
  );
}

/// What a failed answer says, with the way to try again.
function Failed({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <View className="gap-3 py-4">
      <Text tone="muted" className="text-center">
        {error.message}
      </Text>
      <View className="items-center">
        <Button label="Try Again" variant="secondary" onPress={retry} />
      </View>
    </View>
  );
}

/// The Moodle module: connecting, then the courses of the account.
export function MoodleModule() {
  const router = useRouter();
  const theme = useTheme();
  const forget = useForgetMoodle();
  const { data: connection, isLoading } = useMoodleConnection();
  const courses = useMoodleCourses();
  const { account } = useMoodleService();
  const out = useMutation({ mutationFn: account.disconnect, onSuccess: forget });
  if (isLoading) return null;
  if (!connection) return <ConnectMoodle />;
  const shown = (courses.data ?? []).filter((c) => !c.hidden);
  return (
    <View className="gap-4">
      <ListTitle title="Moodle" count={shown.length} />
      <Text tone="muted">{`${connection.fullName || "Signed in"} on ${connection.siteName}`}</Text>
      {courses.error ? <Failed error={courses.error} retry={() => void courses.refetch()} /> : null}
      <Section title="Courses">
        {courses.isSuccess && shown.length === 0 ? <Empty text="No courses on Moodle." /> : null}
        {shown.map((course) => (
          <Row
            key={course.id}
            title={course.fullname}
            subtitle={
              course.progress == null
                ? course.shortname
                : `${course.shortname} · ${Math.round(course.progress)}% done`
            }
            icon={<IconBadge glyph={IconSchool} tint="blue" />}
            onPress={() =>
              router.push(`/moodle/${course.id}?name=${encodeURIComponent(course.fullname)}`)
            }
          />
        ))}
      </Section>
      <View className="items-start">
        <Button
          label="Disconnect Moodle"
          variant="ghost"
          icon={<IconLogout size={16} color={theme.colors.foreground} />}
          status={statusOf(out)}
          onPress={() => out.mutate()}
        />
      </View>
    </View>
  );
}

type CourseTab = "contents" | "assignments" | "grades" | "forums";

/// A course on Moodle, with the desktop's tabs.
export function MoodleCourseScreen({ courseId }: { courseId: number }) {
  const [tab, setTab] = useState<CourseTab>("contents");
  return (
    <Screen>
      <PageTabs
        label="Course"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "contents", label: "Contents" },
          { id: "assignments", label: "Assignments" },
          { id: "grades", label: "Grades" },
          { id: "forums", label: "Forums" },
        ]}
      />
      {tab === "contents" ? <Contents courseId={courseId} /> : null}
      {tab === "assignments" ? <Assignments courseId={courseId} /> : null}
      {tab === "grades" ? <Grades courseId={courseId} /> : null}
      {tab === "forums" ? <Forums courseId={courseId} /> : null}
    </Screen>
  );
}

function ModuleRow({ module }: { module: MoodleModule }) {
  const service = useMoodleService();
  const { data: connection } = useMoodleConnection();
  const look = moduleLook(module.modname);
  const file = module.contents.find((f) => f.type === "file" && f.fileurl);
  return (
    <Row
      title={module.name}
      subtitle={file ? file.filename : plainText(module.description).split("\n")[0] || null}
      icon={<IconBadge glyph={look.glyph} tint={look.tint} />}
      onPress={
        file
          ? () => openOnSite(service, connection, file.fileurl, true)
          : module.url
            ? () => openOnSite(service, connection, module.url)
            : undefined
      }
    />
  );
}

function Contents({ courseId }: { courseId: number }) {
  const contents = useMoodleContents(courseId);
  if (contents.error)
    return <Failed error={contents.error} retry={() => void contents.refetch()} />;
  if (contents.isSuccess && contents.data.length === 0)
    return <Empty text="This course is empty." />;
  return (
    <>
      {(contents.data ?? []).map((section) => (
        <Section key={section.id} title={section.name || "General"}>
          {section.summary ? (
            <Text tone="muted" className="px-1 pb-2">
              {plainText(section.summary)}
            </Text>
          ) : null}
          {section.modules.length === 0 ? <Empty text="Nothing here yet." /> : null}
          {section.modules.map((module) => (
            <ModuleRow key={module.id} module={module} />
          ))}
        </Section>
      ))}
    </>
  );
}

/// "Due Mon, Nov 20", "Was due ...", or when it opens.
function dueLine(a: MoodleAssignment, today = localDay()): string {
  const due = dayOf(a.duedate);
  if (!due) return "No due date";
  return `${due < today ? "Was due" : "Due"} ${dayLabel(due, today)}`;
}

function Assignments({ courseId }: { courseId: number }) {
  const service = useMoodleService();
  const { data: connection } = useMoodleConnection();
  const assignments = useMoodleAssignments(courseId);
  if (assignments.error) {
    return <Failed error={assignments.error} retry={() => void assignments.refetch()} />;
  }
  const sorted = [...(assignments.data ?? [])].sort(
    (a, b) => (a.duedate || Infinity) - (b.duedate || Infinity),
  );
  return (
    <Section>
      {assignments.isSuccess && sorted.length === 0 ? <Empty text="No assignments." /> : null}
      {sorted.map((a) => (
        <Row
          key={a.id}
          title={a.name}
          subtitle={dueLine(a)}
          icon={<IconBadge glyph={IconClipboardList} tint="purple" />}
          onPress={
            connection
              ? () =>
                  openOnSite(
                    service,
                    connection,
                    `${connection.site.root}/mod/assign/view.php?id=${a.cmid}`,
                  )
              : undefined
          }
        />
      ))}
    </Section>
  );
}

function Grades({ courseId }: { courseId: number }) {
  const grades = useMoodleGrades(courseId);
  if (grades.error) return <Failed error={grades.error} retry={() => void grades.refetch()} />;
  const items = grades.data ?? [];
  return (
    <Section>
      {grades.isSuccess && items.length === 0 ? <Empty text="No grades yet." /> : null}
      {items.map((item) => (
        <Row
          key={item.id}
          title={item.itemtype === "course" ? "Course total" : item.itemname || "Grade"}
          subtitle={item.rangeformatted ? `Out of ${item.rangeformatted}` : null}
          icon={<IconBadge glyph={IconReportAnalytics} tint="green" />}
          trailing={
            <Text className="font-medium">
              {item.gradeformatted && item.gradeformatted !== "-"
                ? item.gradeformatted
                : "No grade"}
            </Text>
          }
        />
      ))}
    </Section>
  );
}

function ForumSection({ forum }: { forum: MoodleForum }) {
  const router = useRouter();
  const [open, setOpen] = useState(forum.type === "news");
  const discussions = useMoodleDiscussions(forum.id, open);
  return (
    <Section title={forum.name}>
      {!open ? (
        <Row
          title={`${forum.numdiscussions} ${forum.numdiscussions === 1 ? "discussion" : "discussions"}`}
          icon={<IconBadge glyph={IconMessages} tint="green" />}
          onPress={() => setOpen(true)}
        />
      ) : null}
      {discussions.error ? (
        <Failed error={discussions.error} retry={() => void discussions.refetch()} />
      ) : null}
      {open && discussions.isSuccess && discussions.data.length === 0 ? (
        <Empty text="No discussions yet." />
      ) : null}
      {(discussions.data ?? []).map((d) => (
        <Row
          key={d.discussion}
          title={d.name || d.subject}
          subtitle={`${d.userfullname} · ${dayLabel(dayOf(d.timemodified) ?? localDay())}`}
          icon={<IconBadge glyph={IconSpeakerphone} tint="green" />}
          onPress={() =>
            router.push(`/moodle/discussion/${d.discussion}?name=${encodeURIComponent(d.name)}`)
          }
        />
      ))}
    </Section>
  );
}

function Forums({ courseId }: { courseId: number }) {
  const forums = useMoodleForums(courseId);
  if (forums.error) return <Failed error={forums.error} retry={() => void forums.refetch()} />;
  if (forums.isSuccess && forums.data.length === 0) return <Empty text="No forums." />;
  return (
    <>
      {(forums.data ?? []).map((forum) => (
        <ForumSection key={forum.id} forum={forum} />
      ))}
    </>
  );
}

/// A forum discussion: its posts, oldest first.
export function MoodleDiscussionScreen({ discussionId }: { discussionId: number }) {
  const posts = useMoodlePosts(discussionId);
  return (
    <Screen>
      {posts.error ? <Failed error={posts.error} retry={() => void posts.refetch()} /> : null}
      {(posts.data ?? []).map((post) => (
        <View key={post.id} className="gap-1 border-b border-border/60 pb-4">
          <Text className="font-semibold">{post.subject}</Text>
          <Text variant="small" tone="muted">
            {`${post.author.fullname} · ${dayLabel(dayOf(post.timecreated) ?? localDay())}`}
          </Text>
          <Text selectable>{plainText(post.message)}</Text>
        </View>
      ))}
    </Screen>
  );
}

/// One finish per link: a second try would find the sign in already used up.
const finishing = new Map<string, Promise<Connection>>();
function finishOnce(service: MoodleService, link: string): Promise<Connection> {
  const running = finishing.get(link) ?? service.account.finish(link);
  finishing.set(link, running);
  return running;
}

/// Finishing a sign in Moodle sent back: a short wait, then the courses or what went wrong.
export function MoodleSignInScreen({ link }: { link: string }) {
  const router = useRouter();
  const service = useMoodleService();
  const forget = useForgetMoodle();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    finishOnce(service, link).then(
      async () => {
        await forget();
        if (!live) return;
        if (router.canGoBack()) router.back();
        else router.replace("/");
      },
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [link, forget, router, service]);
  return (
    <Screen>
      <Text tone={error ? "destructive" : "muted"} className="py-8 text-center">
        {error ?? "Finishing the sign in…"}
      </Text>
      {error ? (
        <View className="items-center">
          <Button label="Back" variant="secondary" onPress={() => router.back()} />
        </View>
      ) : null}
    </Screen>
  );
}
