import { deadlineBucket } from "./assignment-view.ts";
import { statusOption } from "./option-badges.tsx";
import { ASSIGNMENT_STATUSES, EXAM_STATUSES, type FixedStatus } from "@nookly/shared/colors";
import { useEntityMenu } from "./entity-actions.tsx";
import {
  type AssignmentRecord,
  createDeck,
  setDeckExam,
  setAssignmentCourse,
  setAssignmentDueBeforeSession,
  setAssignmentDueDate,
  setCourseProfessor,
  setCourseRoom,
  setExamCourse,
  updateAssignment,
  updateExam,
  weightPercent,
} from "@nookly/shared/data";
import {
  IconStar,
  IconCalendarEvent,
  IconCalendarTime,
  IconCircleDot,
  IconClock,
  IconMapPin,
  IconReportAnalytics,
  IconPlus,
  IconSchool,
  IconUserCircle,
  IconStarOff,
  IconX,
} from "@tabler/icons-react-native";
import type { Option } from "../ui/sheet/OptionList.tsx";
import { useRouter } from "expo-router";
import { type ReactNode, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useLocalWrite } from "../data/context.tsx";
import {
  useAssignment,
  useAssignments,
  useCourse,
  useCourses,
  useExam,
  useAssignmentDueSession,
  useDecks,
  useGradeReport,
  useExams,
  useSessions,
} from "../data/queries.ts";
import { Button, IconButton } from "../ui/Button.tsx";
import { PropertyList } from "../ui/Property.tsx";
import { shownValue } from "../ui/DateField.tsx";
import type { MenuIcon } from "../ui/menu.tsx";
import { DayPicker } from "../ui/sheet/DayPicker.tsx";
import { OptionList } from "../ui/sheet/OptionList.tsx";
import { useSheet } from "../ui/sheet/Sheet.tsx";
import { TOUCH_ROW } from "../ui/touch.ts";
import { AtAGlance, DetailsPart, MainPart } from "../ui/parts.tsx";
import {
  ChoiceProperty,
  DayProperty,
  NumberRow,
  SheetProperty,
  TextRow,
} from "../ui/property-rows.tsx";
import { Empty, Row, Section } from "../ui/Row.tsx";
import { CARD_CLASSES } from "@nookly/ui/classes";
import { cn } from "../ui/classes.ts";
import { EntityIcon } from "../ui/icons.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { clockText, useTwelveHour } from "../ui/TimeInput.tsx";
import { dayLabel, localDay } from "./dates.ts";
import { AssignmentRows, ExamRows } from "./StudyLists.tsx";
import { CourseSemesterPicker } from "./PlannerScreens.tsx";
import { CourseProperty } from "./StudyPickers.tsx";
import { OwnNotes, PageEditor } from "./PageEditor.tsx";
import { courseStats, inDays } from "./course-stats.ts";

/// The fields of Courses, Exams, Assignments and Decks, as their detail pages show
/// them on the desktop.

/// A fixed set of statuses as the options of a row.
/// The desktop's Evaluation: ungraded work (homework) or work that counts towards the
/// course grade. Going back to ungraded hides the grade but keeps it.
const EVALUATIONS: Option[] = [
  {
    id: "ungraded",
    label: "Ungraded",
    subtitle: "Does not count towards the course grade",
    glyph: IconStarOff,
    tint: "gray",
  },
  {
    id: "graded",
    label: "Graded",
    subtitle: "Counts towards the course grade",
    glyph: IconStar,
    tint: "yellow",
  },
];

function statusOptions(statuses: FixedStatus[]) {
  return statuses.map(statusOption);
}

function useCourseName(spaceId: string) {
  const { data: courses = [] } = useCourses(spaceId);
  return (id: string | null) => courses.find((c) => c.entity.id === id)?.entity.title;
}

export function CourseDetail({ id, readOnly }: { id: string; readOnly: boolean }) {
  const theme = useTheme();
  const router = useRouter();
  const { data: course } = useCourse(id);
  const { data: exams = [] } = useExams({ courseId: id });
  const { data: assignments = [] } = useAssignments({ courseId: id });
  const professor = useLocalWrite((db, value: string | null) => setCourseProfessor(db, id, value));
  const room = useLocalWrite((db, value: string | null) => setCourseRoom(db, id, value));
  if (!course) return null;
  const spaceId = course.entity.spaceId;
  const muted = theme.colors.mutedForeground;
  const add = (what: "exam" | "assignment", label: string) =>
    readOnly ? undefined : (
      <IconButton
        label={label}
        icon={<IconPlus size={18} color={muted} />}
        onPress={() => router.push(`/new/${what}?spaceId=${spaceId}&courseId=${id}`)}
      />
    );
  const properties = (
    <PropertyList>
      <TextRow
        icon={<IconUserCircle size={20} color={muted} />}
        label="Professor"
        value={course.professor}
        readOnly={readOnly}
        placeholder="Add professor"
        onSave={(value) => professor.mutate(value)}
      />
      <TextRow
        icon={<IconMapPin size={20} color={muted} />}
        label="Room"
        value={course.room}
        readOnly={readOnly}
        placeholder="Add room"
        onSave={(value) => room.mutate(value)}
      />
      <CourseSemesterPicker courseId={id} spaceId={spaceId} readOnly={readOnly} />
    </PropertyList>
  );
  return (
    <>
      <AtAGlance>{properties}</AtAGlance>
      <MainPart>
        <OwnNotes kind="course" ownerId={id} readOnly={readOnly} />
        <CourseTiles courseId={id} spaceId={spaceId} />
        <Section
          title="Sessions"
          action={
            <Button
              label="View all"
              variant="ghost"
              size="sm"
              onPress={() => router.push(`/module/${spaceId}/sessions`)}
            />
          }
        >
          <SessionList courseId={id} />
        </Section>
        <Section
          title="Exams"
          action={
            <>
              {add("exam", "New Exam")}
              <Button
                label="View all"
                variant="ghost"
                size="sm"
                onPress={() => router.push(`/module/${spaceId}/exams`)}
              />
            </>
          }
        >
          <ExamRows exams={exams} />
        </Section>
        <Section
          title="Assignments"
          action={
            <>
              {add("assignment", "New Assignment")}
              <Button
                label="View all"
                variant="ghost"
                size="sm"
                onPress={() => router.push(`/module/${spaceId}/assignments`)}
              />
            </>
          }
        >
          <AssignmentRows assignments={assignments} />
        </Section>
      </MainPart>
      <DetailsPart>{properties}</DetailsPart>
    </>
  );
}

export function ExamDetail({ id, readOnly }: { id: string; readOnly: boolean }) {
  const theme = useTheme();
  const { data: exam } = useExam(id);
  const update = useLocalWrite((db, patch: Parameters<typeof updateExam>[2]) =>
    updateExam(db, id, patch),
  );
  const course = useLocalWrite((db, courseId: string) => setExamCourse(db, id, courseId));
  if (!exam) return null;
  const muted = theme.colors.mutedForeground;
  const properties = (
    <PropertyList>
      <ChoiceProperty
        icon={<IconCircleDot size={20} color={muted} />}
        label="Status"
        value={exam.status}
        readOnly={readOnly}
        options={statusOptions(EXAM_STATUSES)}
        onChange={(status) => update.mutate({ status })}
      />
      <DayProperty
        icon={<IconCalendarEvent size={20} color={muted} />}
        label="Exam date"
        value={exam.examDate}
        readOnly={readOnly}
        onChange={(examDate) => update.mutate({ examDate })}
      />
      <DayProperty
        icon={<IconClock size={20} color={muted} />}
        label="Time"
        mode="time"
        placeholder="All day"
        value={exam.examTime}
        readOnly={readOnly}
        onChange={(examTime) => update.mutate({ examTime })}
      />
      <TextRow
        icon={<IconMapPin size={20} color={muted} />}
        label="Room"
        value={exam.room}
        readOnly={readOnly}
        placeholder="Add room"
        onSave={(room) => update.mutate({ room })}
      />
      <NumberRow
        icon={<IconReportAnalytics size={20} color={muted} />}
        label="Weight (%)"
        value={weightPercent(exam.weight)}
        readOnly={readOnly}
        placeholder="Add weight"
        onSave={(p) => update.mutate({ weight: p === null ? null : p / 100 })}
      />
      <NumberRow
        icon={<IconStar size={20} color={muted} />}
        label="Grade"
        value={exam.grade}
        readOnly={readOnly}
        placeholder="Add grade"
        onSave={(grade) => update.mutate({ grade })}
      />
      <CourseProperty
        icon={<IconSchool size={20} color={muted} />}
        spaceId={exam.entity.spaceId}
        value={exam.courseId}
        readOnly={readOnly}
        onChange={(courseId) => course.mutate(courseId)}
      />
    </PropertyList>
  );
  return (
    <>
      <AtAGlance>{properties}</AtAGlance>
      <MainPart>
        <PageEditor entityId={id} readOnly={readOnly} embedded />
        <ExamDecks examId={id} spaceId={exam.entity.spaceId} readOnly={readOnly} />
      </MainPart>
      <DetailsPart>{properties}</DetailsPart>
    </>
  );
}

/// The first step of the due date sheet, as the desktop's cards: a day, before the next
/// session, or before one session picked.
function DueChoice({
  icon: Icon,
  title,
  description,
  selected,
  disabled,
  onPress,
}: {
  icon: MenuIcon;
  title: string;
  description: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={description}
      accessibilityState={{ selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={TOUCH_ROW}
      className={cn(
        "min-h-16 flex-row items-center gap-3 rounded-xl border border-border px-4 py-3.5 active:bg-accent",
        selected && "border-primary bg-primary/10",
        disabled && "opacity-50",
      )}
    >
      <View
        className={cn(
          "size-9 items-center justify-center rounded-lg",
          selected ? "bg-primary/15" : "bg-muted",
        )}
      >
        <Icon size={20} color={selected ? theme.colors.primary : theme.colors.mutedForeground} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="font-medium">{title}</Text>
        <Text variant="small" tone="muted">
          {description}
        </Text>
      </View>
    </Pressable>
  );
}

const DUE_PRESETS = [
  { label: "Day of", days: 0 },
  { label: "1 day", days: 1 },
  { label: "2 days", days: 2 },
  { label: "1 week", days: 7 },
];

/// When an assignment is due, in the desktop's steps: a specific day, so many days before
/// the course's next session, or before one session picked (which then moves with it).
function AssignmentDueProperty({
  assignment,
  readOnly,
}: {
  assignment: AssignmentRecord;
  readOnly: boolean;
}) {
  const theme = useTheme();
  const id = assignment.entity.id;
  const fixedDay = useLocalWrite((db, day: string | null) => setAssignmentDueDate(db, id, day));
  const before = useLocalWrite((db, input: { days: number | null; session: string | null }) =>
    setAssignmentDueBeforeSession(db, id, input.days, input.session),
  );
  const value = assignment.dueDate ? shownValue("date", assignment.dueDate) : "None";
  // Red once missed and not handed in, as the desktop's due date.
  const late = deadlineBucket(assignment, localDay()) === "overdue";
  return (
    <SheetProperty
      icon={
        <IconCalendarEvent
          size={20}
          color={late ? theme.colors.destructive : theme.colors.mutedForeground}
        />
      }
      label="Due date"
      value={value}
      valueTone={late ? "destructive" : undefined}
      readOnly={readOnly}
    >
      <AssignmentDueSteps
        assignment={assignment}
        onDay={(day) => fixedDay.mutate(day)}
        onBefore={(days, session) => before.mutate({ days, session })}
      />
    </SheetProperty>
  );
}

function AssignmentDueSteps({
  assignment,
  onDay,
  onBefore,
}: {
  assignment: AssignmentRecord;
  onDay: (day: string | null) => void;
  onBefore: (days: number, session: string | null) => void;
}) {
  const sheet = useSheet();
  const days = assignment.dueSessionOffsetDays;
  const picked = useAssignmentDueSession(assignment.entity.id);
  const noCourse = !assignment.courseId;
  const presets = (session: string | null) => (
    <OptionList
      label="Days before"
      options={DUE_PRESETS.map((p) => ({ id: String(p.days), label: p.label }))}
      value={days === null ? null : String(days)}
      onChange={(n) => onBefore(Number(n), session)}
    />
  );
  /// Why there is nothing to follow: no course, or no session coming.
  const nothing = (text: string) => (
    <Text tone="muted" className="py-4 text-center">
      {text}
    </Text>
  );
  const noSessions = noCourse
    ? "Pick a course first, to follow its sessions."
    : "This course has no upcoming sessions.";
  return (
    <View className="gap-3">
      <DueChoice
        icon={IconCalendarEvent}
        title="Specific date"
        description="Pick a day on the calendar."
        selected={assignment.dueDate !== null && days === null}
        onPress={() =>
          sheet?.push({
            title: "Specific date",
            content: (
              <DayPicker
                label="Due date"
                value={days === null ? assignment.dueDate : null}
                onChange={onDay}
              />
            ),
          })
        }
      />
      <DueChoice
        icon={IconSchool}
        title="Before session"
        description="Follows the course's next session."
        selected={days !== null && picked === null}
        onPress={() =>
          sheet?.push({
            title: "Before session",
            content: noCourse ? nothing(noSessions) : presets(null),
          })
        }
      />
      <DueChoice
        icon={IconCalendarTime}
        title="Specific session"
        description="Follows one of the course's upcoming sessions."
        selected={picked !== null}
        onPress={() =>
          sheet?.push({
            title: "Specific session",
            content: (
              <SessionChoices
                courseId={assignment.courseId}
                picked={picked}
                empty={nothing(noSessions)}
                onPick={(session) =>
                  sheet?.push({ title: "Days before", content: presets(session) })
                }
              />
            ),
          })
        }
      />
      {assignment.dueDate || days !== null ? (
        <ClearDue
          onPress={() => {
            onDay(null);
            sheet?.close();
          }}
        />
      ) : null}
    </View>
  );
}

/// The course's upcoming sessions to follow, read as they arrive: the sheet's step stays
/// open while they load.
function SessionChoices({
  courseId,
  picked,
  empty,
  onPick,
}: {
  courseId: string | null;
  picked: string | null;
  empty: ReactNode;
  onPick: (session: string) => void;
}) {
  const twelve = useTwelveHour();
  const { data: sessions = [] } = useSessions({ courseId: courseId ?? undefined });
  const upcoming = courseId ? sessions.filter((s) => !s.cancelled && s.date >= localDay()) : [];
  if (upcoming.length === 0) return empty;
  return (
    <OptionList
      label="Upcoming sessions"
      options={upcoming.map((s) => ({
        id: s.entity.id,
        label: s.entity.title || "Session",
        glyph: IconCalendarTime,
        tint: "blue",
        subtitle: `${dayLabel(s.date)}, ${clockText(s.startTime, twelve)}`,
      }))}
      value={picked}
      // Then how long before it, as the desktop asks.
      onChange={onPick}
    />
  );
}

/// Takes the due date away: full width and tall enough for a thumb, its cross quiet.
function ClearDue({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Button
      variant="secondary"
      size="lg"
      label="Clear due date"
      icon={<IconX size={18} color={theme.colors.mutedForeground} />}
      onPress={onPress}
    />
  );
}

export function AssignmentDetail({ id, readOnly }: { id: string; readOnly: boolean }) {
  const theme = useTheme();
  const { data: assignment } = useAssignment(id);
  const update = useLocalWrite((db, patch: Parameters<typeof updateAssignment>[2]) =>
    updateAssignment(db, id, patch),
  );
  const course = useLocalWrite((db, courseId: string) => setAssignmentCourse(db, id, courseId));
  const courseName = useCourseName(assignment?.entity.spaceId ?? "");
  if (!assignment) return null;
  const followsSession = assignment.dueSessionOffsetDays !== null;
  const muted = theme.colors.mutedForeground;
  const properties = (
    <PropertyList>
      <ChoiceProperty
        icon={<IconCircleDot size={20} color={muted} />}
        label="Status"
        value={assignment.status}
        readOnly={readOnly}
        options={statusOptions(ASSIGNMENT_STATUSES)}
        onChange={(status) => update.mutate({ status })}
      />
      <AssignmentDueProperty assignment={assignment} readOnly={readOnly} />
      <NumberRow
        icon={<IconReportAnalytics size={20} color={muted} />}
        label="Weight (%)"
        value={weightPercent(assignment.weight)}
        readOnly={readOnly}
        placeholder="Add weight"
        onSave={(p) => update.mutate({ weight: p === null ? null : p / 100 })}
      />
      <ChoiceProperty
        icon={
          assignment.ungraded ? (
            <IconStarOff size={20} color={muted} />
          ) : (
            <IconStar size={20} color={muted} />
          )
        }
        label="Evaluation"
        value={assignment.ungraded ? "ungraded" : "graded"}
        readOnly={readOnly}
        options={EVALUATIONS}
        onChange={(choice) => update.mutate({ ungraded: choice === "ungraded" })}
      />
      {assignment.ungraded ? null : (
        <NumberRow
          icon={<IconStar size={20} color={muted} />}
          label="Grade"
          value={assignment.grade}
          readOnly={readOnly}
          placeholder="Add grade"
          onSave={(grade) => update.mutate({ grade })}
        />
      )}
      <CourseProperty
        icon={<IconSchool size={20} color={muted} />}
        spaceId={assignment.entity.spaceId}
        value={assignment.courseId}
        readOnly={readOnly}
        onChange={(courseId) => course.mutate(courseId)}
      />
    </PropertyList>
  );
  return (
    <>
      <AtAGlance>{properties}</AtAGlance>
      <MainPart>
        <PageEditor entityId={id} readOnly={readOnly} embedded />
      </MainPart>
      <DetailsPart>
        {properties}
        {followsSession ? (
          <Text variant="small" tone="muted">
            Due {assignment.dueSessionOffsetDays} days before a session of{" "}
            {courseName(assignment.courseId) ?? "its course"}, so the day moves with the session.
          </Text>
        ) : null}
      </DetailsPart>
    </>
  );
}

/// A course's next three sessions, from today on.
function SessionList({ courseId }: { courseId: string }) {
  const entityMenu = useEntityMenu();
  const router = useRouter();
  const { data: sessions = [] } = useSessions({ courseId });
  const today = localDay();
  const upcoming = sessions
    .filter((s) => !s.cancelled && s.date >= today)
    .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`))
    .slice(0, 3);
  if (upcoming.length === 0) return <Empty text="No sessions yet." />;
  return upcoming.map((s) => (
    <View key={s.entity.id}>
      <Row
        title={s.entity.title || "Session"}
        subtitle={`${dayLabel(s.date)} · ${s.startTime} to ${s.endTime}${s.location ? ` · ${s.location}` : ""}`}
        icon={<EntityIcon type="session" icon={s.entity.icon} />}
        onPress={() => router.push(`/entity/${s.entity.id}`)}
        onLongPress={() => entityMenu(s.entity)}
      />
    </View>
  ));
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <View className={cn(CARD_CLASSES, "flex-1 gap-1 p-3")} style={{ minWidth: 140 }}>
      <Text variant="small" tone="muted">
        {label}
      </Text>
      <Text className="font-heading text-lg" numberOfLines={1}>
        {value}
      </Text>
      {note ? (
        <Text variant="small" tone="muted" numberOfLines={1}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

/// The course's bento row: the next session, the next exam, the open assignments and the
/// grade so far, and how far the study has got when it has decks.
function CourseTiles({ courseId, spaceId }: { courseId: string; spaceId: string }) {
  const { data: sessions = [] } = useSessions({ courseId });
  const { data: exams = [] } = useExams({ courseId });
  const { data: assignments = [] } = useAssignments({ courseId });
  const { data: decks = [] } = useDecks(spaceId);
  const { data: report } = useGradeReport(spaceId);
  const today = localDay();
  const stats = courseStats(courseId, sessions, exams, assignments, today);
  const grade = report?.semesters.flatMap((g) => g.courses).find((c) => c.course.id === courseId)
    ?.grades.grade;
  const open = assignments.filter((a) => a.status !== "submitted" && a.status !== "evaluated");
  const examIds = new Set(exams.map((e) => e.entity.id));
  const mine = decks.filter((d) => d.examId && examIds.has(d.examId));
  const cards = mine.reduce((n, d) => n + d.stats.total, 0);
  const fresh = mine.reduce((n, d) => n + d.stats.new, 0);
  const session = stats.nextSession;
  return (
    <View className="flex-row flex-wrap gap-3">
      <Tile
        label="Next Session"
        value={session ? `${dayLabel(session.date)} ${session.startTime}` : "None"}
        note={session?.location ?? undefined}
      />
      <Tile
        label="Next Exam"
        value={stats.exams.next ? shortDay(stats.exams.next) : "None"}
        note={stats.exams.next ? inDays(stats.exams.next, today) : undefined}
      />
      <Tile
        label="Open Assignments"
        value={`${open.length} open / ${assignments.length} total`}
        note={
          stats.assignments.nextDue ? `due ${inDays(stats.assignments.nextDue, today)}` : undefined
        }
      />
      <Tile
        label="Course Grade"
        value={
          grade === null || grade === undefined ? "No grade" : String(Math.round(grade * 100) / 100)
        }
      />
      {cards > 0 ? (
        <Tile
          label="Study Progress"
          value={`${Math.round(((cards - fresh) / cards) * 100)}%`}
          note={`${cards} cards`}
        />
      ) : null}
    </View>
  );
}

const shortDay = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/// The decks written for an exam, with how many cards are left to study, and a line to add one.
function ExamDecks({
  examId,
  spaceId,
  readOnly,
}: {
  examId: string;
  spaceId: string;
  readOnly: boolean;
}) {
  const entityMenu = useEntityMenu();
  const theme = useTheme();
  const router = useRouter();
  const { data: decks = [] } = useDecks(spaceId);
  const [title, setTitle] = useState("");
  const add = useLocalWrite(async (db, name: string) => {
    const deck = await createDeck(db, spaceId, name);
    await setDeckExam(db, deck, examId);
    return deck;
  });
  const mine = decks.filter((d) => d.examId === examId);
  const submit = () => {
    const name = title.trim();
    if (name) add.mutate(name, { onSuccess: () => setTitle("") });
  };
  return (
    <Section title="Decks">
      {mine.length === 0 ? <Empty text="No decks for this exam yet." /> : null}
      {mine.map((d) => {
        const waiting = d.stats.due + d.stats.learning + d.stats.new;
        return (
          <View key={d.entity.id}>
            <Row
              title={d.entity.title || "Untitled"}
              subtitle={`${waiting} to study of ${d.stats.total}`}
              icon={<EntityIcon type="index_card_deck" icon={d.entity.icon} />}
              onPress={() => router.push(`/entity/${d.entity.id}`)}
              onLongPress={() => entityMenu(d.entity)}
            />
          </View>
        );
      })}
      {readOnly ? null : (
        <View className="min-h-12 flex-row items-center gap-2 px-4">
          <IconPlus size={18} color={theme.colors.mutedForeground} />
          <TextInput
            accessibilityLabel="New deck"
            value={title}
            onChangeText={setTitle}
            onSubmitEditing={submit}
            returnKeyType="done"
            placeholder="Deck name"
            placeholderTextColor={theme.colors.mutedForeground}
            className="h-12 flex-1 font-sans text-sm text-foreground"
          />
        </View>
      )}
    </Section>
  );
}
