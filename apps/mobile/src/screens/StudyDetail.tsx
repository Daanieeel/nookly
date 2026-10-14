import { ASSIGNMENT_STATUSES, EXAM_STATUSES, type FixedStatus } from "@nookly/shared/colors";
import {
  type IndexCard,
  createCard,
  deleteCard,
  setAssignmentCourse,
  setAssignmentDueDate,
  setCourseProfessor,
  setDeckExam,
  setExamCourse,
  studyQueue,
  updateAssignment,
  updateCard,
  updateExam,
  weightPercent,
} from "@nookly/shared/data";
import { useForm } from "@tanstack/react-form";
import { IconPlus } from "@tabler/icons-react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { z } from "zod";
import { useLocalWrite } from "../data/context.tsx";
import {
  useAssignment,
  useAssignments,
  useCards,
  useCourse,
  useCourses,
  useDeck,
  useExam,
  useExams,
} from "../data/queries.ts";
import { Button, IconButton, statusOf } from "../ui/Button.tsx";
import { Chip, ChipGroup } from "../ui/Chips.tsx";
import { DateField } from "../ui/DateField.tsx";
import { Field } from "../ui/Field.tsx";
import { NumberProperty, TextProperty } from "../ui/PropertyFields.tsx";
import { Empty, Section, Separator } from "../ui/Row.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { fieldError } from "./forms.ts";
import { AssignmentRows, ExamRows, deckSummary } from "./StudyLists.tsx";
import { StatusIcon } from "./TaskRow.tsx";

/// The fields of Courses, Exams, Assignments and Decks, as their detail pages show
/// them on the desktop.

function Padded({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return <View style={{ padding: theme.space(3), gap: theme.space(3) }}>{children}</View>;
}

function StatusChips({
  statuses,
  value,
  onChange,
  readOnly,
}: {
  statuses: FixedStatus[];
  value: string;
  onChange: (id: string) => void;
  readOnly: boolean;
}) {
  return (
    <Section title="Status">
      <Padded>
        <ChipGroup label="Status">
          {statuses.map((s) => (
            <Chip
              key={s.id}
              label={s.name}
              selected={s.id === value}
              disabled={readOnly}
              icon={<StatusIcon status={s} size={16} />}
              onPress={() => s.id !== value && onChange(s.id)}
            />
          ))}
        </ChipGroup>
      </Padded>
    </Section>
  );
}

/// The Course an exam or assignment belongs to: exactly one, of its Space.
export function CoursePicker({
  spaceId,
  value,
  onChange,
  readOnly = false,
}: {
  spaceId: string;
  value: string | null;
  onChange: (courseId: string) => void;
  readOnly?: boolean;
}) {
  const { data: courses = [] } = useCourses(spaceId);
  if (courses.length === 0) return <Text tone="muted">Make a Course first, under Courses.</Text>;
  return (
    <ChipGroup label="Course" scroll>
      {courses.map((c) => (
        <Chip
          key={c.entity.id}
          label={c.entity.title || "Untitled"}
          selected={c.entity.id === value}
          disabled={readOnly}
          onPress={() => c.entity.id !== value && onChange(c.entity.id)}
        />
      ))}
    </ChipGroup>
  );
}

/// The Exam a deck prepares for, or none.
export function ExamPicker({
  spaceId,
  value,
  onChange,
  readOnly = false,
}: {
  spaceId: string;
  value: string | null;
  onChange: (examId: string | null) => void;
  readOnly?: boolean;
}) {
  const { data: exams = [] } = useExams({ spaceId });
  return (
    <ChipGroup label="Exam" scroll>
      <Chip
        label="No exam"
        selected={value === null}
        disabled={readOnly}
        onPress={() => value !== null && onChange(null)}
      />
      {exams.map((e) => (
        <Chip
          key={e.entity.id}
          label={e.entity.title || "Untitled"}
          selected={e.entity.id === value}
          disabled={readOnly}
          onPress={() => e.entity.id !== value && onChange(e.entity.id)}
        />
      ))}
    </ChipGroup>
  );
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
  if (!course) return null;
  const spaceId = course.entity.spaceId;
  const add = (what: "exam" | "assignment", label: string) =>
    readOnly ? undefined : (
      <IconButton
        label={label}
        icon={<IconPlus size={18} color={theme.colors.mutedForeground} />}
        onPress={() => router.push(`/new/${what}?spaceId=${spaceId}&courseId=${id}`)}
      />
    );
  return (
    <>
      <TextProperty
        label="Professor"
        value={course.professor}
        readOnly={readOnly}
        placeholder="Who teaches it"
        onSave={(value) => professor.mutate(value)}
      />
      <Section title="Exams" action={add("exam", "New Exam")}>
        <ExamRows exams={exams} />
      </Section>
      <Section title="Assignments" action={add("assignment", "New Assignment")}>
        <AssignmentRows assignments={assignments} />
      </Section>
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
  return (
    <>
      <StatusChips
        statuses={EXAM_STATUSES}
        value={exam.status}
        readOnly={readOnly}
        onChange={(status) => update.mutate({ status })}
      />
      <Section title="Course">
        <Padded>
          <CoursePicker
            spaceId={exam.entity.spaceId}
            value={exam.courseId}
            readOnly={readOnly}
            onChange={(courseId) => course.mutate(courseId)}
          />
        </Padded>
      </Section>
      <Section title="When and where">
        <Padded>
          <View style={{ flexDirection: "row", gap: theme.space(3) }}>
            <View style={{ flex: 3 }}>
              <DateField
                label="Day"
                value={exam.examDate}
                readOnly={readOnly}
                onChange={(examDate) => update.mutate({ examDate })}
              />
            </View>
            <View style={{ flex: 2 }}>
              <DateField
                label="Time"
                mode="time"
                placeholder="All day"
                value={exam.examTime}
                readOnly={readOnly}
                onChange={(examTime) => update.mutate({ examTime })}
              />
            </View>
          </View>
          <TextProperty
            label="Room"
            value={exam.room}
            readOnly={readOnly}
            placeholder="H 0104"
            onSave={(room) => update.mutate({ room })}
          />
        </Padded>
      </Section>
      <Section title="Grade">
        <Padded>
          <View style={{ flexDirection: "row", gap: theme.space(3) }}>
            <View style={{ flex: 1 }}>
              <NumberProperty
                label="Weight (%)"
                value={weightPercent(exam.weight)}
                readOnly={readOnly}
                placeholder="20"
                onSave={(p) => update.mutate({ weight: p === null ? null : p / 100 })}
              />
            </View>
            <View style={{ flex: 1 }}>
              <NumberProperty
                label="Grade"
                value={exam.grade}
                readOnly={readOnly}
                placeholder="1.7"
                onSave={(grade) => update.mutate({ grade })}
              />
            </View>
          </View>
        </Padded>
      </Section>
    </>
  );
}

export function AssignmentDetail({ id, readOnly }: { id: string; readOnly: boolean }) {
  const theme = useTheme();
  const { data: assignment } = useAssignment(id);
  const update = useLocalWrite((db, patch: Parameters<typeof updateAssignment>[2]) =>
    updateAssignment(db, id, patch),
  );
  const due = useLocalWrite((db, day: string | null) => setAssignmentDueDate(db, id, day));
  const course = useLocalWrite((db, courseId: string) => setAssignmentCourse(db, id, courseId));
  const courseName = useCourseName(assignment?.entity.spaceId ?? "");
  if (!assignment) return null;
  const followsSession = assignment.dueSessionOffsetDays !== null;
  return (
    <>
      <StatusChips
        statuses={ASSIGNMENT_STATUSES}
        value={assignment.status}
        readOnly={readOnly}
        onChange={(status) => update.mutate({ status })}
      />
      <Section title="Course">
        <Padded>
          <CoursePicker
            spaceId={assignment.entity.spaceId}
            value={assignment.courseId}
            readOnly={readOnly}
            onChange={(courseId) => course.mutate(courseId)}
          />
        </Padded>
      </Section>
      <Section title="Due">
        <Padded>
          <DateField
            label="Due date"
            value={assignment.dueDate}
            readOnly={readOnly}
            onChange={(day) => due.mutate(day)}
          />
          {followsSession ? (
            <Text variant="small" tone="muted">
              Due {assignment.dueSessionOffsetDays} days before a session of{" "}
              {courseName(assignment.courseId) ?? "its course"}, set on the desktop. Picking a day
              here fixes it to that day.
            </Text>
          ) : null}
        </Padded>
      </Section>
      <Section title="Grade">
        <Padded>
          <View style={{ flexDirection: "row", gap: theme.space(3) }}>
            <View style={{ flex: 1 }}>
              <NumberProperty
                label="Weight (%)"
                value={weightPercent(assignment.weight)}
                readOnly={readOnly}
                placeholder="10"
                onSave={(p) => update.mutate({ weight: p === null ? null : p / 100 })}
              />
            </View>
            <View style={{ flex: 1 }}>
              <NumberProperty
                label="Grade"
                value={assignment.grade}
                readOnly={readOnly}
                placeholder="1.3"
                onSave={(grade) => update.mutate({ grade })}
              />
            </View>
          </View>
        </Padded>
      </Section>
    </>
  );
}

const cardSchema = z.object({
  front: z.string().trim().min(1, "Write the question"),
  back: z.string().trim().min(1, "Write the answer"),
});

function CardForm({
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
  const theme = useTheme();
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
      <View style={{ flexDirection: "row", gap: theme.space(2) }}>
        <Button
          label={submitLabel}
          variant="primary"
          status={statusOf(status)}
          errorLabel="Couldn't save"
          onPress={() => void form.handleSubmit()}
        />
        {onDelete ? <Button label="Delete Card" variant="ghost" onPress={onDelete} /> : null}
      </View>
    </Padded>
  );
}

function CardRow({ card, readOnly }: { card: IndexCard; readOnly: boolean }) {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const save = useLocalWrite((db, next: { front: string; back: string }) =>
    updateCard(db, card.id, next.front, next.back),
  );
  const remove = useLocalWrite((db) => deleteCard(db, card.id));
  if (editing) {
    return (
      <CardForm
        initial={{ front: card.front, back: card.back }}
        submitLabel="Save Card"
        status={save}
        onSubmit={async (next) => {
          await save.mutateAsync(next);
          setEditing(false);
        }}
        onDelete={() => remove.mutate(undefined)}
      />
    );
  }
  return (
    <Pressable
      accessibilityRole={readOnly ? undefined : "button"}
      accessibilityLabel={`${card.front}, ${card.back}`}
      accessibilityHint={readOnly ? undefined : "Edit the card"}
      disabled={readOnly}
      onPress={() => setEditing(true)}
      style={({ pressed }) => ({
        padding: theme.space(3),
        gap: theme.space(1),
        backgroundColor: pressed ? theme.colors.accent : theme.colors.card,
      })}
    >
      <Text numberOfLines={2}>{card.front}</Text>
      <Text variant="small" tone="muted" numberOfLines={2}>
        {card.back}
      </Text>
    </Pressable>
  );
}

export function DeckDetail({ id, readOnly }: { id: string; readOnly: boolean }) {
  const router = useRouter();
  const { data: deck } = useDeck(id);
  const { data: cards = [] } = useCards(id);
  const exam = useLocalWrite((db, examId: string | null) => setDeckExam(db, id, examId));
  const add = useLocalWrite((db, card: { front: string; back: string }) =>
    createCard(db, id, card.front, card.back),
  );
  if (!deck) return null;
  const queue = studyQueue(cards);
  return (
    <>
      <Section title="Study">
        <Padded>
          <Text tone="muted">{deckSummary(deck.stats)}</Text>
          <Button
            label={queue.length > 0 ? `Study ${queue.length}` : "Nothing due now"}
            variant="primary"
            disabled={queue.length === 0}
            onPress={() => router.push(`/study/${id}`)}
          />
        </Padded>
      </Section>
      <Section title="Exam">
        <Padded>
          <ExamPicker
            spaceId={deck.entity.spaceId}
            value={deck.examId}
            readOnly={readOnly}
            onChange={(examId) => exam.mutate(examId)}
          />
        </Padded>
      </Section>
      {!readOnly ? (
        <Section title="New card">
          <CardForm
            initial={{ front: "", back: "" }}
            submitLabel="Add Card"
            status={add}
            onSubmit={async (card) => {
              await add.mutateAsync(card);
            }}
          />
        </Section>
      ) : null}
      <Section title={`Cards · ${cards.length}`}>
        {cards.length === 0 ? <Empty text="No cards yet." /> : null}
        {cards.map((card, i) => (
          <View key={card.id}>
            {i > 0 ? <Separator /> : null}
            <CardRow card={card} readOnly={readOnly} />
          </View>
        ))}
      </Section>
    </>
  );
}
