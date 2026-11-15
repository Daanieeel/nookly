import { type ProblemKind, describeMoodleProblem } from "@nookly/shared/moodle/errors";
import {
  IconAlertTriangle,
  IconExternalLink,
  IconEyeOff,
  IconLock,
  IconPuzzle,
  IconWifiOff,
} from "@tabler/icons-react-native";
import { useMutation } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Image, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { type Fetched, fileUrl, type MoodleCourse, type RemoteFile } from "../moodle/api.ts";
import { fileFacts, fileLook } from "../moodle/format.ts";
import { useForgetMoodle, useMoodleConnection } from "../moodle/queries.ts";
import { useMoodleService } from "../moodle/service.tsx";
import { Stack } from "expo-router";
import { BAR_BUTTON } from "../ui/bar.ts";
import { TOOLBAR_ICONS } from "../ui/toolbar-icons.ts";
import { Button, statusOf } from "../ui/Button.tsx";
import type { GlyphIcon } from "../ui/kit/Glyph.tsx";
import { IconBadge } from "../ui/kit/IconBadge.tsx";
import { useScheme, useSemantic } from "../ui/kit/scheme.ts";
import { Row } from "../ui/Row.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { CORNER, RADIUS, TINT, type TintName } from "../ui/tokens.ts";

/// What every Moodle page on the phone is made of, as the desktop's `MoodleStates.tsx`,
/// `MoodleFrame.tsx` and `CourseArt.tsx`.

/// The same page on the Moodle website.
export function OpenInMoodle({ url }: { url: string | null }) {
  const service = useMoodleService();
  const theme = useTheme();
  if (!url) return null;
  return (
    <View className="items-start">
      <Button
        label="Open in Moodle"
        variant="ghost"
        size="sm"
        icon={<IconExternalLink size={16} color={theme.colors.foreground} />}
        onPress={() => void service.open(url)}
      />
    </View>
  );
}

/// A Moodle page's bar buttons: the same page on the Moodle website and, on the module's own
/// page, Sign Out. Icons, as the desktop's header has them.
export function MoodleBar({ url, onSignOut }: { url: string | null; onSignOut?: () => void }) {
  const service = useMoodleService();
  if (!url && !onSignOut) return null;
  return (
    <Stack.Toolbar placement="right">
      {url ? (
        <Stack.Toolbar.Button
          icon={TOOLBAR_ICONS.openExternal}
          {...BAR_BUTTON}
          accessibilityLabel="Open in Moodle"
          onPress={() => void service.open(url)}
        />
      ) : null}
      {onSignOut ? (
        <Stack.Toolbar.Button
          icon={TOOLBAR_ICONS.signOut}
          {...BAR_BUTTON}
          accessibilityLabel="Sign Out"
          onPress={onSignOut}
        />
      ) : null}
    </Stack.Toolbar>
  );
}

/// Said above a page read from what was kept, while Moodle is out of reach.
function OfflineNote() {
  const theme = useTheme();
  return (
    <View className="flex-row items-center gap-1.5">
      <IconWifiOff size={14} color={theme.colors.mutedForeground} />
      <Text variant="small" tone="muted">
        Offline, showing what Nookly read last time
      </Text>
    </View>
  );
}

const PROBLEM_LOOK = {
  offline: { glyph: IconWifiOff, tint: "yellow" },
  "signed-out": { glyph: IconLock, tint: "yellow" },
  "grades-hidden": { glyph: IconEyeOff, tint: "yellow" },
  denied: { glyph: IconLock, tint: "red" },
  unreadable: { glyph: IconPuzzle, tint: "red" },
  other: { glyph: IconAlertTriangle, tint: "red" },
} satisfies Record<ProblemKind, { glyph: GlyphIcon; tint: TintName }>;

/// A problem with Moodle, said kindly: what happened, what can be done about it (try again,
/// connect again, or read it on the website), and Moodle's own words below.
function MoodleProblem({
  message,
  retry,
  webUrl,
}: {
  message: string;
  retry: () => void;
  webUrl: string | null;
}) {
  const problem = describeMoodleProblem(message);
  const look = PROBLEM_LOOK[problem.kind];
  const service = useMoodleService();
  const forget = useForgetMoodle();
  const again = useMutation({ mutationFn: service.signOut, onSuccess: forget });
  return (
    <View accessibilityRole="alert" className="items-center gap-3 py-8">
      <IconBadge glyph={look.glyph} tint={look.tint} size={52} />
      <Text variant="heading" className="text-center">
        {problem.title}
      </Text>
      <Text tone="muted" className="text-center">
        {problem.description}
      </Text>
      <View className="flex-row flex-wrap justify-center gap-2">
        {problem.kind === "signed-out" ? (
          <Button
            label="Connect Again"
            variant="secondary"
            status={statusOf(again)}
            onPress={() => again.mutate()}
          />
        ) : (
          <Button label="Try Again" variant="secondary" onPress={retry} />
        )}
        {problem.offerWebsite ? <OpenInMoodle url={webUrl} /> : null}
      </View>
      <Text variant="small" tone="muted" selectable className="text-center">
        {problem.details}
      </Text>
    </View>
  );
}

/// Grey bars in the shape of the rows on their way, so nothing jumps when they arrive.
function Placeholder({ label, rows }: { label: string; rows: number }) {
  const fill = useSemantic("fill");
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} className="flex-row items-center gap-3 py-2.5">
          <View
            style={[CORNER, { width: 30, height: 30, borderRadius: 8, backgroundColor: fill }]}
          />
          <View className="flex-1 gap-1.5">
            <View
              style={{
                height: 12,
                width: `${70 - (i % 3) * 15}%`,
                borderRadius: 4,
                backgroundColor: fill,
              }}
            />
            <View style={{ height: 10, width: "35%", borderRadius: 4, backgroundColor: fill }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/// A Moodle answer on its way: placeholders while it loads, the problem when it failed, a
/// note when it is what was kept, `empty` for nothing, and `children` for the answer.
export function MoodleData<T>({
  query,
  label,
  rows = 4,
  webUrl = null,
  empty,
  children,
}: {
  query: {
    data: Fetched<T> | undefined;
    error: Error | null;
    refetch: () => void;
  };
  /// What a screen reader hears while it loads.
  label: string;
  rows?: number;
  /// The same page on the website, offered when Moodle won't let Nookly read it.
  webUrl?: string | null;
  empty?: (data: T) => ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (query.error) {
    return (
      <MoodleProblem
        message={query.error.message}
        retry={() => void query.refetch()}
        webUrl={webUrl}
      />
    );
  }
  if (!query.data) return <Placeholder label={label} rows={rows} />;
  const { data, offline } = query.data;
  const nothing = empty?.(data) ?? null;
  return (
    <>
      {offline ? <OfflineNote /> : null}
      {nothing ?? children(data)}
    </>
  );
}

/// Gradients for courses without a banner, as the desktop's, so each has a look of its own.
const PALETTES: [TintName, TintName][] = [
  ["blue", "purple"],
  ["green", "blue"],
  ["pink", "purple"],
  ["yellow", "pink"],
  ["purple", "blue"],
  ["green", "yellow"],
];

/// A course's banner from Moodle, or its colors with a few rings when it has none.
export function CourseArt({
  course,
  size = 44,
}: {
  course: Pick<MoodleCourse, "id" | "overviewfiles">;
  size?: number;
}) {
  const scheme = useScheme();
  const { data: connection } = useMoodleConnection();
  const [from, to] = PALETTES[Math.abs(course.id) % PALETTES.length] ?? ["blue", "purple"];
  const banner = course.overviewfiles[0];
  const source = banner && connection ? fileUrl(connection, banner.fileurl) : null;
  const id = `course-${course.id}`;
  return (
    <View
      testID="course-art"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        CORNER,
        { width: size, height: size, borderRadius: RADIUS.badge * 1.4, overflow: "hidden" },
      ]}
    >
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={TINT[from][scheme]} stopOpacity={0.55} />
            <Stop offset="1" stopColor={TINT[to][scheme]} stopOpacity={0.45} />
          </LinearGradient>
        </Defs>
        <Rect width={size} height={size} fill={`url(#${id})`} />
        <Circle
          cx={size * 0.95}
          cy={size * 0.05}
          r={size * 0.45}
          stroke={TINT.gray[scheme]}
          strokeOpacity={0.25}
          fill="none"
        />
        <Circle
          cx={size * 0.1}
          cy={size * 1.05}
          r={size * 0.35}
          fill={TINT.gray[scheme]}
          fillOpacity={0.12}
        />
      </Svg>
      {source ? (
        <Image
          source={{ uri: source }}
          style={{ position: "absolute", inset: 0 }}
          resizeMode="cover"
        />
      ) : null}
    </View>
  );
}

/// A file of the site on its row: its kind's icon, its title and what it says about itself.
export function FileRow({
  file,
  title = file.filename,
  onPress,
}: {
  file: RemoteFile;
  title?: string;
  onPress: () => void;
}) {
  const look = fileLook(file);
  return (
    <Row
      title={title}
      subtitle={fileFacts(file, title)}
      icon={<IconBadge glyph={look.glyph} tint={look.tint} />}
      onPress={onPress}
    />
  );
}
