import { Grid } from "../ui/Grid.tsx";
import { useIsTablet } from "../ui/pane.tsx";
import { moodleWebUrl } from "@nookly/shared/moodle/path";
import { firstNameOf } from "@nookly/shared/moodle/format";
import { IconLock, IconSchool, IconWorld } from "@tabler/icons-react-native";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import type { Connection, MoodleCourse } from "../moodle/api.ts";
import { splitCourses } from "../moodle/format.ts";
import { signInPath } from "../moodle/intent.ts";
import { useForgetMoodle, useMoodleConnection, useMoodleCourses } from "../moodle/queries.ts";
import { type MoodleService, useMoodleService } from "../moodle/service.tsx";
import { BrandButton, MoodleMark } from "../ui/BrandButton.tsx";
import { Button, statusOf } from "../ui/Button.tsx";
import { Field } from "../ui/Field.tsx";
import { FormSection } from "../ui/kit/Form.tsx";
import { IconBadge } from "../ui/kit/IconBadge.tsx";
import { EmptyState } from "../ui/kit/States.tsx";
import { Row, Section } from "../ui/Row.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { CourseArt, MoodleBar, MoodleData } from "./MoodleParts.tsx";

/// Moodle on the phone, as on the desktop (`features/moodle`): connect once with the
/// university's own sign in page, then read the courses, their contents, assignments,
/// grades and forums without opening the website.

/// Connecting: the site's address, then its own sign in page in the browser. Moodle sends
/// the person back to Nookly, which finishes the rest (`app/moodle-signin.tsx`).
function ConnectMoodle() {
  const theme = useTheme();
  const service = useMoodleService();
  const [site, setSite] = useState("");
  const router = useRouter();
  const open = useMutation({
    mutationFn: async (address: string) => {
      const link = await service.signIn(await service.account.begin(address));
      const finish = link ? signInPath(link) : null;
      if (finish) router.push(finish);
    },
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
      <BrandButton
        label="Sign In with Moodle"
        mark={<MoodleMark />}
        status={statusOf(open)}
        errorLabel="Try Again"
        onPress={() => site.trim() && open.mutate(site)}
      />
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

/// The courses of one group, on now or over, each with its colors and progress.
function CourseGroup({
  title,
  courses,
  spaceId,
}: {
  title: string;
  courses: MoodleCourse[];
  spaceId: string;
}) {
  const router = useRouter();
  const tablet = useIsTablet();
  if (courses.length === 0) return null;
  const detail = (course: MoodleCourse) =>
    course.progress == null
      ? course.shortname
      : `${course.shortname} · ${Math.round(course.progress)}% done`;
  const open = (course: MoodleCourse) =>
    router.push(
      `/moodle/${course.id}?name=${encodeURIComponent(course.fullname)}&spaceId=${spaceId}`,
    );
  // A tablet's are the desktop's course cards, the art across the top (5.15).
  if (tablet) {
    return (
      <Section title={title}>
        <Grid min={220} max={4}>
          {courses.map((course) => (
            <Pressable
              key={course.id}
              testID="course-card"
              accessibilityRole="button"
              accessibilityLabel={`${course.fullname}, ${detail(course)}`}
              onPress={() => open(course)}
              className="overflow-hidden rounded-xl border border-border bg-card active:opacity-70"
            >
              <View className="h-24 overflow-hidden">
                <CourseArt course={course} size={320} />
              </View>
              <View className="gap-0.5 p-3">
                <Text numberOfLines={2} className="font-medium">
                  {course.fullname}
                </Text>
                <Text variant="small" tone="muted">
                  {detail(course)}
                </Text>
              </View>
            </Pressable>
          ))}
        </Grid>
      </Section>
    );
  }
  return (
    <Section title={title}>
      {courses.map((course) => (
        <Row
          key={course.id}
          title={course.fullname}
          subtitle={detail(course)}
          icon={<CourseArt course={course} />}
          onPress={() => open(course)}
        />
      ))}
    </Section>
  );
}

/// The Moodle module: connecting, then the courses of the account, on now first.
export function MoodleModule({ spaceId = "" }: { spaceId?: string }) {
  const forget = useForgetMoodle();
  const { data: connection, isLoading } = useMoodleConnection();
  const courses = useMoodleCourses();
  const service = useMoodleService();
  const out = useMutation({ mutationFn: service.signOut, onSuccess: forget });
  if (isLoading) return null;
  if (!connection) return <ConnectMoodle />;
  const firstName = firstNameOf(connection.fullName);
  const webUrl = moodleWebUrl(connection.site.root, { page: "courses" });
  return (
    <View className="gap-4">
      <Text variant="title" accessibilityRole="header" className="px-1">
        {firstName ? `Welcome back, ${firstName}` : "Moodle"}
      </Text>
      <Text tone="muted" className="px-1">
        {connection.siteName}
      </Text>
      <MoodleBar url={webUrl} onSignOut={() => out.mutate()} />
      <MoodleData
        query={courses}
        label="Loading your courses"
        webUrl={webUrl}
        empty={(all) =>
          all.every((c) => c.hidden) ? (
            <EmptyState
              glyph={IconSchool}
              title="No courses on Moodle"
              message="Courses you are enrolled in show up here."
            />
          ) : null
        }
      >
        {(all) => {
          const { current, past } = splitCourses(all);
          return (
            <>
              <CourseGroup title="Now" courses={current} spaceId={spaceId} />
              <CourseGroup title="Past courses" courses={past} spaceId={spaceId} />
            </>
          );
        }}
      </MoodleData>
      {out.error ? <Text tone="destructive">Couldn't sign out, try again.</Text> : null}
    </View>
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
