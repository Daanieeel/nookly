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
import { useForm } from "@tanstack/react-form";
import {
  IconAward,
  IconCalendarDue,
  IconCalendarEvent,
  IconCalendarTime,
  IconCircleDot,
  IconClock,
  IconDoor,
  IconPercentage,
  IconPlus,
  IconSchool,
  IconUser,
  IconX,
} from "@tabler/icons-react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { z } from "zod";
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
import { Button, IconButton, statusOf } from "../ui/Button.tsx";
import { Field } from "../ui/Field.tsx";
import { PropertyList } from "../ui/Property.tsx";
import { shownValue } from "../ui/DateField.tsx";
import type { MenuIcon } from "../ui/menu.tsx";
import { DayPicker } from "../ui/sheet/DayPicker.tsx";
import { OptionList } from "../ui/sheet/OptionList.tsx";
import { useSheet } from "../ui/sheet/Sheet.tsx";
import { TOUCH_ROW } from "../ui/touch.ts";
import { DetailsPart, MainPart } from "../ui/parts.tsx";
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
import { dayLabel, localDay } from "./dates.ts";
import { fieldError } from "./forms.ts";
import { AssignmentRows, ExamRows } from "./StudyLists.tsx";
import { CourseSemesterPicker, ExamStudyBlocks } from "./PlannerScreens.tsx";
import { CourseProperty } from "./StudyPickers.tsx";
import { PageEditor } from "./PageEditor.tsx";
import { courseStats, inDays } from "./course-stats.ts";
import { StatusIcon } from "./TaskRow.tsx";

/// The fields of Courses, Exams, Assignments and Decks, as their detail pages show
/// them on the desktop.

function Padded({ children }: { children: React.ReactNode }) {
  return <View className="gap-3 p-3">{children}</View>;
}

/// A fixed set of statuses as the options of a row.
function statusOptions(statuses: FixedStatus[]) {
  return statuses.map((s) => ({
    id: s.id,
    label: s.name,
    icon: <StatusIcon status={s} size={16} />,
  }));
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
  return (
    <>
      <MainPart>
        <PageEditor entityId={id} readOnly={readOnly} live={false} />
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
      <DetailsPart>
        <PropertyList>
          <TextRow
            icon={<IconUser size={20} color={muted} />}
            label="Professor"
            value={course.professor}
            readOnly={readOnly}
            placeholder="Who teaches it"
            onSave={(value) => professor.mutate(value)}
          />
          <TextRow
            icon={<IconDoor size={20} color={muted} />}
            label="Room"
            value={course.room}
            readOnly={readOnly}
            placeholder="Where it meets"
            onSave={(value) => room.mutate(value)}
          />
          <CourseSemesterPicker courseId={id} spaceId={spaceId} readOnly={readOnly} />
        </PropertyList>
      </DetailsPart>
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
  return (
    <>
      <MainPart>
        <PageEditor entityId={id} readOnly={readOnly} live={false} />
        <ExamDecks examId={id} spaceId={exam.entity.spaceId} readOnly={readOnly} />
        <ExamStudyBlocks examId={id} spaceId={exam.entity.spaceId} readOnly={readOnly} />
      </MainPart>
      <DetailsPart>
        <PropertyList>
          <ChoiceProperty
            icon={<IconCircleDot size={20} color={muted} />}
            label="Status"
            value={exam.status}
            readOnly={readOnly}
            options={statusOptions(EXAM_STATUSES)}
            onChange={(status) => update.mutate({ status })}
          />
          <CourseProperty
            icon={<IconSchool size={20} color={muted} />}
            spaceId={exam.entity.spaceId}
            value={exam.courseId}
            readOnly={readOnly}
            onChange={(courseId) => course.mutate(courseId)}
          />
          <DayProperty
            icon={<IconCalendarEvent size={20} color={muted} />}
            label="Day"
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
            icon={<IconDoor size={20} color={muted} />}
            label="Room"
            value={exam.room}
            readOnly={readOnly}
            placeholder="H 0104"
            onSave={(room) => update.mutate({ room })}
          />
          <NumberRow
            icon={<IconPercentage size={20} color={muted} />}
            label="Weight (%)"
            value={weightPercent(exam.weight)}
            readOnly={readOnly}
            placeholder="20"
            onSave={(p) => update.mutate({ weight: p === null ? null : p / 100 })}
          />
          <NumberRow
            icon={<IconAward size={20} color={muted} />}
            label="Grade"
            value={exam.grade}
            readOnly={readOnly}
            placeholder="1.7"
            onSave={(grade) => update.mutate({ grade })}
          />
        </PropertyList>
      </DetailsPart>
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
        "flex-row items-center gap-3 rounded-lg border border-border px-3 py-2 active:bg-accent",
        selected && "border-primary bg-primary/10",
        disabled && "opacity-50",
      )}
    >
      <Icon size={18} color={selected ? theme.colors.primary : theme.colors.mutedForeground} />
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
  return (
    <SheetProperty
      icon={<IconCalendarDue size={20} color={theme.colors.mutedForeground} />}
      label="Due date"
      value={value}
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
  const { data: sessions = [] } = useSessions({ courseId: assignment.courseId ?? undefined });
  const days = assignment.dueSessionOffsetDays;
  const picked = useAssignmentDueSession(assignment.entity.id);
  const upcoming = sessions.filter((s) => !s.cancelled && s.date >= localDay());
  const noCourse = !assignment.courseId;
  const presets = (session: string | null) => (
    <OptionList
      label="Days before"
      options={DUE_PRESETS.map((p) => ({ id: String(p.days), label: p.label }))}
      value={days === null ? null : String(days)}
      onChange={(n) => onBefore(Number(n), session)}
    />
  );
  return (
    <View className="gap-2">
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
        disabled={noCourse}
        onPress={() => sheet?.push({ title: "Before session", content: presets(null) })}
      />
      <DueChoice
        icon={IconCalendarTime}
        title="Specific session"
        description="Follows one of the course's upcoming sessions."
        selected={picked !== null}
        disabled={noCourse || upcoming.length === 0}
        onPress={() =>
          sheet?.push({
            title: "Specific session",
            content: (
              <OptionList
                label="Upcoming sessions"
                options={upcoming.map((s) => ({
                  id: s.entity.id,
                  label: `${dayLabel(s.date)} ${s.startTime}`,
                }))}
                value={picked}
                onChange={(session) => onBefore(days ?? 0, session)}
              />
            ),
          })
        }
      />
      {assignment.dueDate || days !== null ? (
        <Button
          variant="secondary"
          size="sm"
          label="Clear due date"
          icon={<IconX size={16} />}
          onPress={() => {
            onDay(null);
            sheet?.close();
          }}
        />
      ) : null}
    </View>
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
  return (
    <>
      <MainPart>
        <PageEditor entityId={id} readOnly={readOnly} live={false} />
      </MainPart>
      <DetailsPart>
        <PropertyList>
          <ChoiceProperty
            icon={<IconCircleDot size={20} color={muted} />}
            label="Status"
            value={assignment.status}
            readOnly={readOnly}
            options={statusOptions(ASSIGNMENT_STATUSES)}
            onChange={(status) => update.mutate({ status })}
          />
          <CourseProperty
            icon={<IconSchool size={20} color={muted} />}
            spaceId={assignment.entity.spaceId}
            value={assignment.courseId}
            readOnly={readOnly}
            onChange={(courseId) => course.mutate(courseId)}
          />
          <AssignmentDueProperty assignment={assignment} readOnly={readOnly} />
          <NumberRow
            icon={<IconPercentage size={20} color={muted} />}
            label="Weight (%)"
            value={weightPercent(assignment.weight)}
            readOnly={readOnly}
            placeholder="10"
            onSave={(p) => update.mutate({ weight: p === null ? null : p / 100 })}
          />
          <NumberRow
            icon={<IconAward size={20} color={muted} />}
            label="Grade"
            value={assignment.grade}
            readOnly={readOnly}
            placeholder="1.3"
            onSave={(grade) => update.mutate({ grade })}
          />
        </PropertyList>
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

const cardSchema = z.object({
  front: z.string().trim().min(1, "Write the question"),
  back: z.string().trim().min(1, "Write the answer"),
});

export function CardForm({
  initial,
  submitLabel,
  onSubmit,
  status,
  onDelete,
}: {
  initial: { front: string; back: string };
  submitLabel: string;
  onSubmit: (card: { front: string; back: string }) => Promise<void>;
  status: { isPending: boolean; isSuccess: boolean; isError: boolean };
  onDelete?: () => void;
}) {
  const form = useForm({
    defaultValues: initial,
    validators: { onSubmit: cardSchema },
    onSubmit: async ({ value }) => {
      await onSubmit({ front: value.front.trim(), back: value.back.trim() });
      form.reset();
    },
  });
  return (
    <Padded>
      <form.Field name="front">
        {(field) => (
          <Field
            label="Front"
            multiline
            placeholder="The question"
            value={field.state.value}
            onChangeText={field.handleChange}
            onBlur={field.handleBlur}
            error={fieldError(field)}
          />
        )}
      </form.Field>
      <form.Field name="back">
        {(field) => (
          <Field
            label="Back"
            multiline
            placeholder="The answer"
            value={field.state.value}
            onChangeText={field.handleChange}
            onBlur={field.handleBlur}
            error={fieldError(field)}
          />
        )}
      </form.Field>
      <View className="flex-row gap-2">
        <Button
          label={submitLabel}
          status={statusOf(status)}
          errorLabel="Couldn't save"
          onPress={() => void form.handleSubmit()}
        />
        {onDelete ? <Button label="Delete Card" variant="ghost" onPress={onDelete} /> : null}
      </View>
    </Padded>
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
  const open = assignments.filter((a) => a.status !== "submitted" && a.status !== "graded");
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
