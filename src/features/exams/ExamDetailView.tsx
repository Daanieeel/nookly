import { IconCalendarTime, IconCards } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { useEffect, useRef, useState } from "react";
import { FieldError } from "@/components/action-feedback";
import { EntityDetailLayout } from "@/components/entity-detail-layout";
import { EntityIcon } from "@/components/entity-icon";
import { NumberProperty, TextProperty } from "@/components/property-fields";
import { PROPERTY_VALUE, PropertyRow } from "@/components/property-row";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { CoursePickerField, useCourseLookup } from "@/features/courses/course-lookup";
import { BlockEditor } from "@/features/notes/BlockEditor";
import {
  type ExtraTab,
  RelatedItemsSection,
  RelatedRow,
} from "@/features/relationships/RelatedItemsSection";
import { TasksDataContext, useTasksDataValue } from "@/features/tasks/task-controls";
import { formatTimestamp } from "@/features/tasks/task-model";
import {
  DueDatePicker,
  DueLabel,
  PendingIcon,
  PROPERTY_PILL,
  StatusPicker,
  TaskStatusIcon,
} from "@/features/tasks/task-properties";
import { createDeck, listDecks } from "@/lib/api/decks";
import {
  listExams,
  setExamCourse,
  updateExam,
  updateExamDate,
  updateExamGrade,
  updateExamRoom,
  updateExamWeight,
} from "@/lib/api/exams";
import { listRelationships } from "@/lib/api/relationships";
import { createStudyBlock, listStudyBlocks } from "@/lib/api/studyBlocks";
import type { Entity, Exam } from "@/lib/api/types";
import { formatClock, formatShortDate, formatWeekday } from "@/lib/datetime";
import { useNavStore } from "@/lib/store/nav";
import { cn } from "@/lib/utils";
import { EXAM_STATUSES, examStatus, examStatusKind, weightPercent } from "./exam-model";

/// An Exam's page, laid out like a Task's: description editor, Tasks and Notes
/// linked to it (plus its Decks and Study blocks) where sub-tasks would be, and
/// a Linear style properties panel in the right sidebar.
export function ExamDetailView({ entity }: { entity: Entity }) {
  // The related Tasks tab draws Task status and due date controls.
  const tasksData = useTasksDataValue(entity.spaceId);
  return (
    <TasksDataContext.Provider value={tasksData}>
      <ExamPage entity={entity} />
    </TasksDataContext.Provider>
  );
}

function ExamPage({ entity }: { entity: Entity }) {
  const sidebarCollapsed = useNavStore((s) => s.rightSidebarCollapsed);
  const { data: exams = [] } = useQuery({
    queryKey: ["exams", entity.spaceId],
    queryFn: () => listExams(entity.spaceId),
  });
  const exam = exams.find((e) => e.entity.id === entity.id);
  const extraTabs = useExamTabs(entity);

  return (
    <EntityDetailLayout entity={entity} sidebar={exam && <PropertiesPanel exam={exam} />}>
      <div className="mx-auto flex w-full max-w-3xl flex-col pb-24">
        {/* Properties live in the sidebar; without it they sit above the description,
            indented by the editor's handle gutter to line up with its text. */}
        {exam && (
          <div
            className={cn(
              "mb-2 flex flex-wrap items-center gap-1.5 pl-13",
              !sidebarCollapsed && "lg:hidden",
            )}
          >
            <ExamStatusControl exam={exam} />
            <ExamDateControl exam={exam} />
          </div>
        )}
        <BlockEditor entityId={entity.id} spaceId={entity.spaceId} />
        <RelatedItemsSection entity={entity} extraTabs={extraTabs} />
      </div>
    </EntityDetailLayout>
  );
}

/// Saves one exam field and refreshes the exams list it's read from.
function useExamSave<T>(exam: Exam, save: (id: string, value: T) => Promise<void>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: T) => save(exam.entity.id, value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["exams", exam.entity.spaceId] }),
  });
}

/// Red once the exam is behind, yellow today or tomorrow, unless it's done.
function examTone(exam: Exam): "overdue" | "soon" | null {
  if (!exam.examDate || exam.status === "done") return null;
  const days = differenceInCalendarDays(parseISO(exam.examDate), new Date());
  if (days < 0) return "overdue";
  return days <= 1 ? "soon" : null;
}

function ExamStatusControl({ exam }: { exam: Exam }) {
  const change = useExamSave(exam, (id, status: string) => updateExam(id, null, status));
  const status = examStatus(exam.status);
  return (
    <StatusPicker
      statuses={EXAM_STATUSES}
      kindOf={examStatusKind}
      value={exam.status}
      onSelect={(next) => change.mutate(next)}
    >
      <button
        type="button"
        aria-label={change.isError ? "Couldn't change status, try again" : "Change Status"}
        className="relative flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-accent data-[state=open]:bg-accent"
      >
        <PendingIcon
          pending={change.isPending}
          failed={change.isError}
          idle={<TaskStatusIcon status={status} kind={examStatusKind(status.id)} />}
        />
      </button>
    </StatusPicker>
  );
}

/// The exam date as a pill that opens the date picker, or "Set exam date".
function ExamDateControl({ exam }: { exam: Exam }) {
  const change = useExamSave(exam, updateExamDate);
  return (
    <DueDatePicker value={exam.examDate} noun="exam date" onSelect={(day) => change.mutate(day)}>
      <button
        type="button"
        aria-label={change.isError ? "Couldn't set the exam date, try again" : "Change Exam Date"}
        className={cn(PROPERTY_PILL, "relative", change.isError && "border-destructive/60")}
      >
        <PendingIcon pending={change.isPending} failed={change.isError} idle={null} />
        {exam.examDate ? <DueLabel day={exam.examDate} tone={examTone(exam)} /> : "Set exam date"}
      </button>
    </DueDatePicker>
  );
}

/// Linear's properties panel: each value is its own control, and shows its own
/// spinner or warning while a change saves or after it failed.
function PropertiesPanel({ exam }: { exam: Exam }) {
  const queryClient = useQueryClient();
  const { courseOf } = useCourseLookup(exam.entity.spaceId, "exam-course");
  const course = courseOf.get(exam.entity.id);
  const status = examStatus(exam.status);

  const setStatus = useExamSave(exam, (id, next: string) => updateExam(id, null, next));
  const setDate = useExamSave(exam, updateExamDate);
  const setRoom = useExamSave(exam, updateExamRoom);
  const setWeight = useExamSave(exam, updateExamWeight);
  const setGrade = useExamSave(exam, updateExamGrade);
  const setCourse = useMutation({
    mutationFn: (courseId: string) => setExamCourse(exam.entity.id, courseId),
    onSuccess: (_, courseId) =>
      Promise.all(
        [
          ["exams", exam.entity.spaceId],
          ["relationships", courseId],
          ["relationships", course?.id],
        ]
          .filter(([, id]) => id)
          .map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ),
  });

  return (
    <section aria-label="Properties" className="flex flex-col gap-0.5">
      <PropertyRow label="Status">
        <StatusPicker
          statuses={EXAM_STATUSES}
          kindOf={examStatusKind}
          value={exam.status}
          onSelect={(next) => setStatus.mutate(next)}
        >
          <button
            type="button"
            aria-label={setStatus.isError ? "Couldn't change status, try again" : "Change Status"}
            className={PROPERTY_VALUE}
          >
            <PendingIcon
              pending={setStatus.isPending}
              failed={setStatus.isError}
              idle={<TaskStatusIcon status={status} kind={examStatusKind(status.id)} />}
            />
            <span className="truncate">{status.name}</span>
          </button>
        </StatusPicker>
      </PropertyRow>

      <PropertyRow label="Exam date">
        <DueDatePicker
          value={exam.examDate}
          noun="exam date"
          align="end"
          onSelect={(day) => setDate.mutate(day)}
        >
          <button
            type="button"
            aria-label={
              setDate.isError ? "Couldn't set the exam date, try again" : "Change exam date"
            }
            className={PROPERTY_VALUE}
          >
            {(setDate.isPending || setDate.isError) && (
              <PendingIcon pending={setDate.isPending} failed={setDate.isError} idle={null} />
            )}
            {exam.examDate ? (
              <DueLabel day={exam.examDate} tone={examTone(exam)} />
            ) : (
              <span className="text-muted-foreground">Set exam date</span>
            )}
          </button>
        </DueDatePicker>
      </PropertyRow>

      <PropertyRow label="Room">
        <TextProperty
          value={exam.room}
          onSave={(room) => setRoom.mutate(room)}
          placeholder="Add room"
          label="Room"
          pending={setRoom.isPending}
          failed={setRoom.isError}
        />
      </PropertyRow>

      <PropertyRow label="Weight">
        <NumberProperty
          value={weightPercent(exam.weight)}
          onSave={(percent) => setWeight.mutate(percent === null ? null : percent / 100)}
          addLabel="Add weight"
          clearLabel="Remove Weight"
          startAt={20}
          step={5}
          min={0}
          max={100}
          unit="%"
          pending={setWeight.isPending}
          failed={setWeight.isError}
        />
      </PropertyRow>

      <PropertyRow label="Grade">
        <NumberProperty
          value={exam.grade}
          onSave={(grade) => setGrade.mutate(grade)}
          addLabel="Add grade"
          clearLabel="Remove Grade"
          min={0}
          pending={setGrade.isPending}
          failed={setGrade.isError}
        />
      </PropertyRow>

      <PropertyRow label="Course">
        <CoursePickerField
          spaceId={exam.entity.spaceId}
          course={course}
          onChange={(courseId) => setCourse.mutate(courseId)}
          pending={setCourse.isPending}
          failed={setCourse.isError}
        />
      </PropertyRow>

      <PropertyRow label="Created">
        <span className="flex h-7 items-center px-2 text-sm text-muted-foreground">
          {formatTimestamp(exam.entity.createdAt)}
        </span>
      </PropertyRow>
      <PropertyRow label="Updated">
        <span className="flex h-7 items-center px-2 text-sm text-muted-foreground">
          {formatTimestamp(exam.entity.updatedAt)}
        </span>
      </PropertyRow>
    </section>
  );
}

/// The Decks and Study blocks tabs: both belong to exactly one exam, so they
/// are created here rather than linked.
function useExamTabs(exam: Entity): ExtraTab[] {
  const queryClient = useQueryClient();
  const { spaceId } = exam;
  const { data: links = [] } = useQuery({
    queryKey: ["relationships", exam.id],
    queryFn: () => listRelationships(exam.id, "both"),
  });
  const { data: decks = [] } = useQuery({
    queryKey: ["decks", spaceId],
    queryFn: () => listDecks(spaceId),
  });
  const { data: blocks = [] } = useQuery({
    queryKey: ["study-blocks", spaceId],
    queryFn: () => listStudyBlocks(spaceId),
  });

  const fromIds = (type: string) =>
    new Set(links.filter((l) => l.relationshipType === type).map((l) => l.fromEntityId));
  const deckIds = fromIds("deck-exam");
  const blockIds = fromIds("study-block-exam");
  const examDecks = decks.filter((d) => deckIds.has(d.id));
  const examBlocks = blocks
    .filter((b) => blockIds.has(b.entity.id))
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));

  const refresh = (key: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: [key, spaceId] }),
      queryClient.invalidateQueries({ queryKey: ["relationships", exam.id] }),
    ]);

  return [
    {
      id: "decks",
      label: "Decks",
      icon: <IconCards size={14} />,
      count: examDecks.length,
      noun: "Deck",
      rows: examDecks.map((deck) => (
        <RelatedRow
          key={deck.id}
          entity={deck}
          leading={
            <span className="flex size-6 shrink-0 items-center justify-center">
              <EntityIcon entity={deck} className="text-muted-foreground" />
            </span>
          }
          trailing={null}
        />
      )),
      renderAdd: (done) => (
        <TitleAddRow
          placeholder="Deck name, Enter to add, Esc to stop"
          label="New deck name"
          errorLabel="Couldn't add the deck, press Enter to retry"
          onAdd={async (title) => {
            await createDeck(spaceId, title, exam.id);
            await refresh("decks");
          }}
          onDone={done}
        />
      ),
    },
    {
      id: "study-blocks",
      label: "Study blocks",
      icon: <IconCalendarTime size={14} />,
      count: examBlocks.length,
      noun: "Study block",
      rows: examBlocks.map((block) => (
        <RelatedRow
          key={block.entity.id}
          entity={block.entity}
          leading={
            <span className="flex size-6 shrink-0 items-center justify-center">
              <IconCalendarTime size={14} className="text-muted-foreground" />
            </span>
          }
          trailing={
            <span className="pointer-events-none shrink-0 text-xs text-muted-foreground tabular-nums">
              {`${formatWeekday(block.date, "short")}, ${formatShortDate(block.date)} · ${formatClock(block.startTime)} to ${formatClock(block.endTime)}`}
            </span>
          }
        />
      )),
      renderAdd: (done) => (
        <StudyBlockAddRow
          onAdd={async (date) => {
            await createStudyBlock(
              spaceId,
              `Study: ${exam.title}`,
              exam.id,
              date,
              "18:00",
              "20:00",
            );
            await refresh("study-blocks");
          }}
          onDone={done}
        />
      ),
    },
  ];
}

/// Types a title in place: Enter adds it and stays open for the next, Escape stops.
function TitleAddRow({
  placeholder,
  label,
  errorLabel,
  onAdd,
  onDone,
}: {
  placeholder: string;
  label: string;
  errorLabel: string;
  onAdd: (title: string) => Promise<void>;
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const add = useMutation({ mutationFn: onAdd, onSuccess: () => setTitle("") });
  useEffect(() => inputRef.current?.focus(), []);

  return (
    <div className="flex flex-col gap-1 border-b border-border/60 py-2 pl-1">
      <div className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center">
          <PendingIcon
            pending={add.isPending}
            failed={add.isError}
            idle={<IconCards size={14} className="text-muted-foreground/60" />}
          />
        </span>
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onDone();
            if (e.key === "Enter" && title.trim() && !add.isPending) {
              e.preventDefault();
              add.mutate(title.trim());
            }
          }}
          onBlur={() => !title.trim() && !add.isError && onDone()}
          placeholder={placeholder}
          aria-label={label}
          aria-invalid={add.isError || undefined}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
        />
      </div>
      <div className="pl-8">
        <FieldError message={add.isError && errorLabel} />
      </div>
    </div>
  );
}

/// Picks a day for a new two hour evening study block.
function StudyBlockAddRow({
  onAdd,
  onDone,
}: {
  onAdd: (date: string) => Promise<void>;
  onDone: () => void;
}) {
  const [date, setDate] = useState<string | null>(null);
  const add = useMutation({ mutationFn: onAdd, onSuccess: onDone });
  return (
    <div className="flex flex-col gap-1 border-b border-border/60 py-2 pl-1">
      <div className="flex items-center gap-2">
        <DateInput
          aria-label="Study block date"
          value={date}
          onChange={setDate}
          className="max-w-56"
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={!date}
          onClick={() => date && !add.isPending && add.mutate(date)}
        >
          <PendingIcon pending={add.isPending} failed={add.isError} idle={null} />
          Schedule 18:00 to 20:00
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
      <FieldError message={add.isError && "Couldn't schedule, try again"} />
    </div>
  );
}
