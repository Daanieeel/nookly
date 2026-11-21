import { usePageFilters } from "../ui/page-filters.tsx";
import { Card } from "../ui/kit/Card.tsx";
import { ListEmpty } from "../ui/ListEmpty.tsx";
import { MODULE_ICONS } from "../ui/icons.tsx";
import { EmptyState } from "../ui/kit/States.tsx";
import {
  type CourseRecord,
  type DeckRecord,
  type ExamRecord,
  type SemesterRecord,
  importDeckFile,
} from "@nookly/shared/data";
import { File } from "expo-file-system";
import { useLocalWrite } from "../data/context.tsx";
import { Button, statusOf } from "../ui/Button.tsx";
import { CORNER, RADIUS } from "../ui/tokens.ts";
import { ListTitle } from "../ui/ListBar.tsx";
import { useEntityMenu } from "./entity-actions.tsx";
import {
  IconCalendarEvent,
  IconCalendarStats,
  IconCircleDot,
  IconCards,
  IconFileImport,
  IconPlayerPlayFilled,
  IconSchool,
} from "@tabler/icons-react-native";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { ListControls } from "../ui/ListControls.tsx";
import { courseOption, statusOption } from "./option-badges.tsx";
import { EXAM_STATUSES } from "@nookly/shared/colors";
import { useEntityFilters } from "../ui/entity-filters.tsx";
import {
  useAssignments,
  useCourseSemesters,
  useCourses,
  useDecks,
  useExams,
  useSemesters,
  useSessions,
} from "../data/queries.ts";
import { Badge } from "../ui/Badge.tsx";
import { Band } from "../ui/Band.tsx";
import { cn } from "../ui/classes.ts";
import { Grid } from "../ui/Grid.tsx";
import { EntityIcon } from "../ui/icons.tsx";
import { ProgressRing } from "../ui/ProgressRing.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { courseStats, inDays } from "./course-stats.ts";
import { addDays, dayLabel, localDay } from "./dates.ts";
import { CONTROL_SIZE, MIN_TOUCH, touchSlop } from "../ui/touch.ts";

/// A soft, light color for a name, steered around the yellows, as the desktop's course
/// banners are: the same name always gets the same one, a rename a new one.
export function bannerColor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  const usable = 360 - 65;
  const raw = Math.abs(hash) % usable;
  const hue = raw < 35 ? raw : raw + 65;
  return `hsl(${hue} 70% 90%)`;
}

const shortDay = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });

function CourseCard({ course }: { course: CourseRecord }) {
  const entityMenu = useEntityMenu();
  const router = useRouter();
  const { data: sessions = [] } = useSessions({ spaceId: course.entity.spaceId });
  const { data: exams = [] } = useExams({ courseId: course.entity.id });
  const { data: assignments = [] } = useAssignments({ courseId: course.entity.id });
  const today = localDay();
  const stats = courseStats(course.entity.id, sessions, exams, assignments, today);
  const name = course.entity.title || "Untitled";
  const a = stats.assignments;
  const e = stats.exams;
  return (
    <Card
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={() => router.push(`/entity/${course.entity.id}`)}
      onLongPress={() => entityMenu(course.entity)}
      className="gap-0 overflow-hidden py-0 active:opacity-80"
    >
      <View
        className="h-14 items-end justify-end p-2"
        style={{ backgroundColor: bannerColor(name) }}
      >
        <IconSchool size={22} color="#000000" opacity={0.5} />
      </View>
      <View className="gap-2 p-3">
        <View className="flex-row items-baseline gap-2">
          <Text numberOfLines={1} className="flex-1 font-medium">
            {name}
          </Text>
          <Text variant="small" tone="muted">
            {course.entity.key}
          </Text>
        </View>
        <Text variant="small" tone="muted" numberOfLines={1}>
          {stats.nextSession
            ? `${dayLabel(stats.nextSession.date)} ${stats.nextSession.startTime}${
                stats.nextSession.location ? `, ${stats.nextSession.location}` : ""
              }`
            : "No sessions"}
        </Text>
        <View className="flex-row items-center gap-2">
          <ProgressRing value={a.total === 0 ? 0 : a.done / a.total} />
          <Text variant="small" tone="muted" numberOfLines={1} className="flex-1">
            {`Assignments ${a.done}/${a.total}${a.nextDue ? ` · ${inDays(a.nextDue, today) === "overdue" ? "overdue" : `due ${inDays(a.nextDue, today)}`}` : ""}`}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <ProgressRing value={e.total === 0 ? 0 : e.done / e.total} />
          <Text variant="small" tone="muted" numberOfLines={1} className="flex-1">
            {`Exams ${e.done}/${e.total}${e.next ? ` · next ${shortDay(e.next)}` : ""}`}
          </Text>
        </View>
      </View>
    </Card>
  );
}

/// A Space's Courses as the desktop's gallery: cards under a band per semester (the current
/// one marked Active), courses with no semester last.
/// The Semester filter's value for a course in none.
const NO_SEMESTER = "none";

export function CourseGallery({ spaceId }: { spaceId: string }) {
  const theme = useTheme();
  const { data: all = [] } = useCourses(spaceId);
  const { data: semesters = [] } = useSemesters(spaceId);
  const { data: inSemester = new Map<string, string>() } = useCourseSemesters(spaceId);
  const filters = usePageFilters(`courses.filters.${spaceId}`);
  const semesterPicks = filters.picked("semester");
  const own = useEntityFilters(filters.entity, filters.setEntity);
  const shown = all.filter(
    (c) =>
      (semesterPicks.length === 0 ||
        semesterPicks.includes(inSemester.get(c.entity.id) ?? NO_SEMESTER)) &&
      own.passes(c.entity),
  );
  const bands: { semester: SemesterRecord | null; courses: CourseRecord[] }[] = semesters
    .map((s) => ({
      semester: s,
      courses: shown.filter((c) => inSemester.get(c.entity.id) === s.entity.id),
    }))
    .filter((b) => b.courses.length > 0);
  const loose = shown.filter((c) => !inSemester.has(c.entity.id));
  if (loose.length > 0) bands.push({ semester: null, courses: loose });
  if (all.length === 0) {
    return (
      <EmptyState glyph={MODULE_ICONS.courses} title="No Courses" message="Tap + to add one." />
    );
  }
  const grouped = semesters.length > 0;
  return (
    <View className="gap-5">
      <ListControls
        title="Courses"
        count={all.length}
        filters={[
          {
            label: "Semester",
            icon: IconCalendarStats,
            values: semesterPicks,
            options: [
              ...semesters.map((s) => ({ id: s.entity.id, label: s.entity.title || "Untitled" })),
              { id: NO_SEMESTER, label: "No semester" },
            ],
            onChange: filters.pick("semester"),
          },
          ...own.fields,
        ]}
      />
      <ListEmpty
        glyph={MODULE_ICONS.courses}
        total={all.length}
        shown={shown.length}
        nothingYet={{ title: "No Courses" }}
        onClear={filters.clear}
      />
      {bands.map((band) => {
        const cards = (
          <Grid min={260} max={3}>
            {band.courses.map((c) => (
              <CourseCard key={c.entity.id} course={c} />
            ))}
          </Grid>
        );
        return grouped ? (
          <Band
            key={band.semester?.entity.id ?? "none"}
            icon={<IconCalendarStats size={16} color={theme.colors.mutedForeground} />}
            title={band.semester?.entity.title || (band.semester ? "Untitled" : "No semester")}
            count={band.courses.length}
            badge={band.semester?.isCurrent ? "Active" : undefined}
          >
            {cards}
          </Band>
        ) : (
          <View key="all">{cards}</View>
        );
      })}
      {filters.saveBar}
    </View>
  );
}

/// When an exam is, from today, as the desktop's Date filter: soon, later, behind, unset.
const EXAM_WHEN = [
  { id: "week", label: "Next 7 days" },
  { id: "later", label: "Later" },
  { id: "past", label: "Past" },
  { id: "none", label: "No date" },
];

export function examWhen(examDate: string | null, today: string): string {
  if (!examDate) return "none";
  if (examDate < today) return "past";
  return examDate <= addDays(today, 7) ? "week" : "later";
}

/// The Exams page: a timeline with what is behind you above a Today marker and what is
/// ahead below it, the next exam as a highlighted card with the days to go.
export function ExamTimeline({ spaceId }: { spaceId: string }) {
  const router = useRouter();
  const theme = useTheme();
  const today = localDay();
  const { data: all = [] } = useExams({ spaceId });
  const { data: courses = [] } = useCourses(spaceId);
  const filters = usePageFilters(`exams.filters.${spaceId}`);
  const picked = filters.picked("course");
  const when = filters.picked("date");
  const statuses = filters.picked("status");
  const own = useEntityFilters(filters.entity, filters.setEntity);
  const picks = (values: string[], value: string) => values.length === 0 || values.includes(value);
  const exams = all.filter(
    (e) =>
      picks(picked, e.courseId ?? "") &&
      picks(when, examWhen(e.examDate, today)) &&
      picks(statuses, e.status) &&
      own.passes(e.entity),
  );
  const courseName = (id: string | null) => courses.find((c) => c.entity.id === id)?.entity.title;
  const dated = exams
    .filter((e) => e.examDate !== null)
    .sort((a, b) => (a.examDate ?? "").localeCompare(b.examDate ?? ""));
  const past = dated.filter((e) => (e.examDate ?? "") < today);
  const ahead = dated.filter((e) => (e.examDate ?? "") >= today);
  const undated = exams.filter((e) => e.examDate === null);
  const next = ahead.find((e) => e.status !== "done") ?? ahead[0];
  if (all.length === 0) {
    return <EmptyState glyph={MODULE_ICONS.exams} title="No Exams" message="Tap + to add one." />;
  }
  const open = (e: ExamRecord) => router.push(`/entity/${e.entity.id}`);
  const used = courses.filter((c) => all.some((e) => e.courseId === c.entity.id));
  return (
    <View className="gap-3">
      <ListControls
        title="Exams"
        count={all.length}
        filters={[
          {
            label: "Course",
            icon: IconSchool,
            values: picked,
            options: used.map((c) => courseOption(c)),
            onChange: filters.pick("course"),
          },
          {
            label: "Date",
            icon: IconCalendarEvent,
            values: when,
            options: EXAM_WHEN,
            onChange: filters.pick("date"),
          },
          {
            label: "Status",
            icon: IconCircleDot,
            values: statuses,
            options: EXAM_STATUSES.map(statusOption),
            onChange: filters.pick("status"),
          },
          ...own.fields,
        ]}
      />
      <ListEmpty
        glyph={MODULE_ICONS.exams}
        total={all.length}
        shown={exams.length}
        nothingYet={{ title: "No Exams" }}
        onClear={filters.clear}
      />
      {past.map((e) => (
        <TimelineNode key={e.entity.id} day={e.examDate} dim>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={e.entity.title || "Exam"}
            onPress={() => open(e)}
            className="flex-row items-center gap-2 py-1 active:opacity-60"
          >
            <Text numberOfLines={1} className="flex-1 text-muted-foreground">
              {e.entity.title || "Exam"}
            </Text>
            <Badge label={e.grade !== null ? "Grade" : "Completed"} size="sm" />
          </Pressable>
        </TimelineNode>
      ))}
      {/* Across the whole width, not only the cards' column. */}
      <View className="flex-row items-center gap-3">
        <View className="h-px flex-1 bg-primary" />
        <Text variant="small" accessibilityRole="header" className="text-primary font-medium">
          Today
        </Text>
        <View className="h-px flex-1 bg-primary" />
      </View>
      {ahead.map((e) => {
        const isNext = e === next;
        const days = Math.max(0, daysBetween(today, e.examDate ?? today));
        return (
          <TimelineNode key={e.entity.id} day={e.examDate}>
            <Card
              accessibilityRole="button"
              accessibilityLabel={e.entity.title || "Exam"}
              onPress={() => open(e)}
              accent={isNext}
              className="gap-2 p-3"
            >
              {isNext ? (
                <Text variant="small" className="font-semibold text-primary">
                  NEXT UP
                </Text>
              ) : null}
              <Text numberOfLines={2} className="font-medium">
                {e.entity.title || "Exam"}
              </Text>
              <View className="flex-row flex-wrap items-center gap-2">
                {courseName(e.courseId) ? (
                  <View className="flex-row items-center gap-1">
                    <IconSchool size={12} color={theme.colors.mutedForeground} />
                    <Text variant="small" tone="muted">
                      {courseName(e.courseId)}
                    </Text>
                  </View>
                ) : null}
                {e.status === "studying" ? <Badge label="Studying" size="sm" /> : null}
                {e.examTime ? (
                  <Text variant="small" tone="muted">
                    {e.examTime}
                  </Text>
                ) : null}
              </View>
              {isNext ? (
                <View className="flex-row items-baseline gap-2">
                  <Text className="font-heading text-3xl">{days}</Text>
                  <Text tone="muted">{days === 1 ? "day to go" : "days to go"}</Text>
                </View>
              ) : null}
            </Card>
          </TimelineNode>
        );
      })}
      {undated.map((e) => (
        <TimelineNode key={e.entity.id} day={null}>
          <Card
            accessibilityRole="button"
            accessibilityLabel={e.entity.title || "Exam"}
            onPress={() => open(e)}
            className="p-3 active:opacity-80"
          >
            <Text>{e.entity.title || "Exam"}</Text>
          </Card>
        </TimelineNode>
      ))}
      {filters.saveBar}
    </View>
  );
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/// The date column: room for "12 Nov" and its weekday, no more.
const DAY_COLUMN = 48;

/// One point of the timeline: its date on the left, a node on the line, the card at the right.
function TimelineNode({
  day,
  dim,
  children,
}: {
  day: string | null;
  dim?: boolean;
  children: React.ReactNode;
}) {
  const date = day ? new Date(`${day}T00:00:00`) : null;
  return (
    <View className={cn("flex-row gap-3", dim && "opacity-60")}>
      <View testID="exam-day" style={{ width: DAY_COLUMN }} className="items-start pt-3">
        <Text variant="small" className="font-medium">
          {date ? date.toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "No day"}
        </Text>
        {date ? (
          <Text variant="small" tone="muted">
            {date.toLocaleDateString(undefined, { weekday: "short" })}
          </Text>
        ) : null}
      </View>
      <View className="items-center">
        <View className="mt-4 size-2 rounded-full bg-border" />
        <View className="w-px flex-1 bg-border" />
      </View>
      <View className="flex-1 pb-1">{children}</View>
    </View>
  );
}

/// A deck as a tile: its cards, its name, the figures that matter and a play button with
/// what is waiting.
export function DeckTile({ deck, examName }: { deck: DeckRecord; examName?: string }) {
  const entityMenu = useEntityMenu();
  const router = useRouter();
  const theme = useTheme();
  const waiting = deck.stats.due + deck.stats.learning + deck.stats.new;
  return (
    <Card
      accessibilityRole="button"
      accessibilityLabel={deck.entity.title || "Deck"}
      onPress={() => router.push(`/entity/${deck.entity.id}`)}
      onLongPress={() => entityMenu(deck.entity)}
      className="gap-3 p-3 active:opacity-80"
    >
      <View className="flex-row items-start gap-3">
        <View className="size-12 items-center justify-center rounded-md border border-border bg-muted">
          <EntityIcon type="index_card_deck" icon={deck.entity.icon} />
          <Text variant="small" tone="muted">
            {deck.stats.total}
          </Text>
        </View>
        <View className="flex-1 gap-1">
          <Text numberOfLines={2} className="font-medium">
            {deck.entity.title || "Untitled"}
          </Text>
          <Text variant="small">
            <Text
              variant="small"
              className={deck.stats.new > 0 ? "text-primary" : "text-muted-foreground"}
            >
              {`${deck.stats.new} new`}
            </Text>
            <Text
              variant="small"
              tone="muted"
            >{`  ${deck.stats.learning} learning  ${deck.stats.due} due`}</Text>
          </Text>
          {examName ? <Badge label={examName} size="sm" /> : null}
        </View>
        {waiting > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Study ${deck.entity.title || "deck"}, ${waiting} ${waiting === 1 ? "card" : "cards"}`}
            onPress={() => router.push(`/study/${deck.entity.id}`)}
            hitSlop={touchSlop(CONTROL_SIZE.sm, MIN_TOUCH)}
            className="h-8 flex-row items-center gap-1 bg-primary px-3 active:opacity-80"
            style={[CORNER, { borderRadius: RADIUS.badge }]}
          >
            <IconPlayerPlayFilled size={12} color={theme.colors.primaryForeground} />
            <Text variant="small" className="font-medium text-primary-foreground">
              {waiting}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

/// Brings in a deck written to a file, from the phone's files.
function ImportDeckButton({ spaceId }: { spaceId: string }) {
  const router = useRouter();
  const theme = useTheme();
  const importDeck = useLocalWrite(async (db, _: undefined) => {
    const picked = await File.pickFileAsync({ mimeTypes: ["application/json", "text/plain"] });
    if (picked.canceled) return null;
    return importDeckFile(db, spaceId, await picked.result.text());
  });
  return (
    <View className="items-end gap-1">
      <Button
        label="Import Deck File"
        variant="secondary"
        size="sm"
        icon={<IconFileImport size={16} color={theme.colors.foreground} />}
        status={statusOf(importDeck)}
        successLabel="Imported"
        errorLabel="Couldn't import it"
        onPress={() =>
          importDeck.mutate(undefined, { onSuccess: (id) => id && router.push(`/entity/${id}`) })
        }
      />
      {importDeck.error ? <Text tone="destructive">{importDeck.error.message}</Text> : null}
    </View>
  );
}

/// The Decks page: tiles in two sections, what is ready to study and what is all caught up.
export function DeckGrid({ spaceId }: { spaceId: string }) {
  const router = useRouter();
  const { data: decks = [] } = useDecks(spaceId);
  const { data: exams = [] } = useExams({ spaceId });
  const examName = (id: string | null) => exams.find((e) => e.entity.id === id)?.entity.title;
  const filters = usePageFilters(`decks.filters.${spaceId}`);
  const examPicks = filters.picked("exam");
  const study = filters.picked("study");
  const own = useEntityFilters(filters.entity, filters.setEntity);
  const waiting = (d: DeckRecord) => d.stats.due + d.stats.learning + d.stats.new > 0;
  const shown = decks.filter(
    (d) =>
      (examPicks.length === 0 || examPicks.includes(d.examId ?? NO_EXAM)) &&
      (study.length === 0 || study.includes(waiting(d) ? "ready" : "done")) &&
      own.passes(d.entity),
  );
  const ready = shown.filter(waiting);
  const caught = shown.filter((d) => !waiting(d));
  const usedExams = exams.filter((e) => decks.some((d) => d.examId === e.entity.id));
  const header = (
    <View className="flex-row flex-wrap items-center gap-2">
      <View style={{ flexGrow: 1 }}>
        <ListTitle title="Decks" count={decks.length} />
      </View>
      <ImportDeckButton spaceId={spaceId} />
    </View>
  );
  if (decks.length === 0) {
    return (
      <View className="gap-5">
        {header}
        <EmptyState
          glyph={IconCards}
          title="No Decks Yet"
          message="Make one, then start writing cards."
          action={{ label: "New Deck", onPress: () => router.push(`/new/deck?spaceId=${spaceId}`) }}
        />
      </View>
    );
  }
  const section = (title: string, list: DeckRecord[]) =>
    list.length === 0 ? null : (
      <View className="gap-2">
        <View className="flex-row items-baseline gap-2 px-1">
          <Text accessibilityRole="header" className="font-medium">
            {title}
          </Text>
          <Text tone="muted">{list.length}</Text>
        </View>
        <Grid min={280} max={3}>
          {list.map((d) => (
            <DeckTile key={d.entity.id} deck={d} examName={examName(d.examId)} />
          ))}
        </Grid>
      </View>
    );
  return (
    <View className="gap-5">
      <ListControls
        title="Decks"
        count={decks.length}
        filters={[
          {
            label: "Exam",
            icon: IconCalendarStats,
            values: examPicks,
            options: [
              ...usedExams.map((e) => ({ id: e.entity.id, label: e.entity.title || "Exam" })),
              { id: NO_EXAM, label: "No exam" },
            ],
            onChange: filters.pick("exam"),
          },
          {
            label: "Cards to study",
            icon: IconCards,
            values: study,
            options: [
              { id: "ready", label: "Ready to study" },
              { id: "done", label: "All caught up" },
            ],
            onChange: filters.pick("study"),
          },
          ...own.fields,
        ]}
      />
      <View className="flex-row justify-end">
        <ImportDeckButton spaceId={spaceId} />
      </View>
      <ListEmpty
        glyph={MODULE_ICONS.decks}
        total={decks.length}
        shown={shown.length}
        nothingYet={{ title: "No Decks", message: "Tap + to make one, or import a deck." }}
        onClear={filters.clear}
      />
      {section("Ready to study", ready)}
      {section("All caught up", caught)}
      {filters.saveBar}
    </View>
  );
}

/// The Exam filter's value for a deck that prepares for none.
const NO_EXAM = "none";
